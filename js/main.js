// 【重要】Firebaseプロジェクト作成時にコピーした設定情報をここに貼り付けます
const firebaseConfig = {
    apiKey: "AIzaSyBMwntiBddYgfYlGSGfq4uSQIgsV28Vcuo",
    authDomain: "pilgrimage-quest-app.firebaseapp.com",
    projectId: "pilgrimage-quest-app",
    storageBucket: "pilgrimage-quest-app.appspot.com",
    messagingSenderId: "561336243744",
    appId: "1:561336243744:web:01af4523c8af329c004e45"
};

// Firebaseアプリの初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const STAMP_LAYERS = [
    'images/stamp_layer_1.png',
    'images/stamp_layer_2.png',
    'images/stamp_layer_3.png',
    'images/stamp_layer_4.png',
    'images/stamp_layer_5.png',
];

function initPwaMap() {
    const app = Vue.createApp({
        data() {
            return {
                loading: true,
                userId: null,
                authToken: null,
                isTokenLoading: false,
                errorMessage: '',
                isScannerVisible: false,
                scanResultMessage: '',
                scanResultClass: '',
                videoStream: null,
                userProfile: null,
                rewardCode: null,
                allQuests: [],
                map: null,
                spots: [],
                // markers: [], // ← この行を削除
                userListener: null,
                activeInfoWindow: null,
                oshis: [
                    { id: 1, name: 'キャラ1', icon: 'images/oshi_1.png' },
                    { id: 2, name: 'キャラ2', icon: 'images/oshi_2.png' },
                    { id: 3, name: 'キャラ3', icon: 'images/oshi_3.png' },
                    { id: 4, name: 'キャラ4', icon: 'images/oshi_4.png' },
                    { id: 5, name: 'キャラ5', icon: 'images/oshi_5.png' },
                ],
                myOshi: 1,
            };
        },
        computed: {
            completedStamps() {
                if (!this.userProfile || !this.userProfile.questProgress) {
                    return [];
                }
                const completedCount = Object.values(this.userProfile.questProgress)
                    .filter(status => status === 'completed').length;
                return STAMP_LAYERS.slice(0, completedCount);
            },
            isRallyComplete() {
                return this.completedStamps.length >= 5;
            },
            inProgressQuests() {
                if (!this.userProfile || !this.userProfile.questProgress || this.allQuests.length === 0) {
                    return [];
                }
                const inProgressQuestIds = Object.keys(this.userProfile.questProgress)
                    .filter(questId => this.userProfile.questProgress[questId] === 'in_progress');
                return this.allQuests.filter(quest => inProgressQuestIds.includes(quest.id));
            },
            rewardImageUrl() {
                return `images/reward_${this.myOshi}.png`;
            }
        },
        async mounted() {
            const savedOshi = localStorage.getItem('myOshi');
            if (savedOshi) {
                this.myOshi = parseInt(savedOshi, 10);
            }

            await this.initializeUser();
            this.loading = false;
            
            // ▼▼▼ Vueの監視外にマーカー配列を定義 ▼▼▼
            this.mapMarkers = [];

            await this.$nextTick();
            this.initializeMap();
        },
        methods: {
            async initializeUser() {
                let savedUserId = localStorage.getItem('questAppUserId');
                if (savedUserId) {
                    this.userId = savedUserId;
                } else {
                    savedUserId = this.generateUniqueId();
                    localStorage.setItem('questAppUserId', savedUserId);
                    this.userId = savedUserId;
                }
                await Promise.all([this.fetchAllQuests(), this.fetchAllSpots()]);
                this.attachUserListener();
            },
            generateUniqueId() {
                return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            },
            attachUserListener() {
                if (this.userListener) {
                    this.userListener();
                }
                const userRef = db.collection("users").doc(this.userId);
                this.userListener = userRef.onSnapshot((doc) => {
                    console.log("スマホアプリ側でユーザーデータの更新を検知しました。");
                    if (doc.exists) {
                        this.userProfile = doc.data();
                    } else {
                        const newUserProfile = { userId: this.userId, questProgress: {} };
                        userRef.set(newUserProfile);
                        this.userProfile = newUserProfile;
                    }
                    if (this.map) {
                        // ▼▼▼ 前回のテストでコメントアウトした箇所を元に戻します ▼▼▼
                        this.placePwaMarkers();
                    }
                });
            },
            initializeMap() {
                const mapElement = document.getElementById('map');
                if (mapElement) {
                    this.map = new google.maps.Map(mapElement, {
                        center: { lat: 36.3910, lng: 139.0622 },
                        zoom: 15,
                        gestureHandling: 'greedy'
                    });
                    this.placePwaMarkers();
                } else {
                    console.error('マップ要素が見つかりません。');
                }
            },
            async fetchAllQuests() {
                const questsSnapshot = await db.collection('quests').get();
                this.allQuests = questsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            },
            async fetchAllSpots() {
                const spotsSnapshot = await db.collection('spots').get();
                this.spots = spotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            },
            placePwaMarkers() {
                // ▼▼▼ this.markers を this.mapMarkers に変更 ▼▼▼
                this.mapMarkers.forEach(marker => marker.setMap(null));
                this.mapMarkers = [];
                // ▲▲▲

                const selectedOshiData = this.oshis.find(o => o.id === this.myOshi);
                if (!selectedOshiData) {
                    console.error("選択された推しキャラが見つかりません。");
                    return;
                }
                const oshiIconUrl = selectedOshiData.icon;

                this.spots.forEach(spot => {
                    const position = {
                        lat: parseFloat(spot.latitude),
                        lng: parseFloat(spot.longitude)
                    };
                    
                    const questStatus = this.userProfile ? this.userProfile.questProgress[spot.questId] : undefined;
                    const isCompleted = questStatus === 'completed';

                    const marker = new google.maps.Marker({
                        position: position,
                        map: this.map,
                        title: spot.name,
                        icon: {
                            url: oshiIconUrl,
                            scaledSize: new google.maps.Size(48, 48),
                        },
                        opacity: isCompleted ? 1.0 : 0.6
                    });
                    
                    const destination = `${spot.latitude},${spot.longitude}`;
                    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`;

                    const infoWindow = new google.maps.InfoWindow({
                        content: `
                            <div>
                                <strong>${spot.name}</strong><br>
                                <a href="${mapsUrl}" target="_blank" class="btn btn-primary btn-sm mt-2">Google マップでナビを開始</a>
                            </div>
                        `
                    });

                    marker.addListener('click', () => {
                        if (this.activeInfoWindow) {
                            this.activeInfoWindow.close();
                        }
                        infoWindow.open(this.map, marker);
                        this.activeInfoWindow = infoWindow;
                    });
                    // ▼▼▼ this.markers を this.mapMarkers に変更 ▼▼▼
                    this.mapMarkers.push(marker);
                    // ▲▲▲
                });
            },
            
            setMyOshi(oshiId) {
                this.myOshi = oshiId;
                localStorage.setItem('myOshi', oshiId);
                this.placePwaMarkers();
            },

            async generateAuthToken() {
                this.isTokenLoading = true;
                this.authToken = null;
                this.errorMessage = '';
                try {
                    const token = Math.floor(100000 + Math.random() * 900000).toString();
                    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
                    await db.collection('authTokens').doc(token).set({
                        userId: this.userId,
                        expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt)
                    });
                    this.authToken = token;
                } catch (error) {
                    console.error("合言葉の発行に失敗しました: ", error);
                    this.errorMessage = "エラーが発生しました。時間をおいて再度お試しください。";
                } finally {
                    this.isTokenLoading = false;
                }
            },
            async startScanner() {
                this.isScannerVisible = true;
                this.scanResultMessage = '';
                this.$nextTick(async () => {
                    const video = document.getElementById('scanner-video');
                    if (!video) {
                        console.error("スキャナーのvideo要素が見つかりません。");
                        this.isScannerVisible = false;
                        return;
                    }
                    try {
                        this.videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                        video.srcObject = this.videoStream;
                        video.play();
                        requestAnimationFrame(this.tick.bind(this));
                    } catch (err) {
                        console.error("カメラの起動に失敗:", err);
                        this.scanResultMessage = "カメラの起動に失敗しました。カメラのアクセスを許可してください。";
                        this.scanResultClass = "alert-danger";
                        this.isScannerVisible = false;
                    }
                });
            },
            stopScanner() {
                if (this.videoStream) {
                    this.videoStream.getTracks().forEach(track => track.stop());
                }
                this.isScannerVisible = false;
            },
            tick() {
                if (!this.isScannerVisible) return;
                const video = document.getElementById('scanner-video');
                if (video.readyState === video.HAVE_ENOUGH_DATA) {
                    const canvasElement = document.createElement('canvas');
                    const canvas = canvasElement.getContext('2d');
                    canvasElement.width = video.videoWidth;
                    canvasElement.height = video.videoHeight;
                    canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
                    const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
                    if (code) {
                        this.stopScanner();
                        this.handleQrCode(code.data);
                        return;
                    }
                }
                requestAnimationFrame(this.tick.bind(this));
            },
            async handleQrCode(qrCodeValue) {
                try {
                    if (qrCodeValue.startsWith('QUEST_START::')) {
                        const questId = qrCodeValue.split('::')[1];
                        const userRef = db.collection("users").doc(this.userId);
                        
                        await userRef.set({
                            userId: this.userId,
                            questProgress: { [questId]: "in_progress" }
                        }, { merge: true });

                        this.scanResultMessage = `クエストを開始しました！`;
                        this.scanResultClass = "alert-info";

                    } else {
                        const questsRef = db.collection("quests");
                        const querySnapshot = await questsRef.where("clearQRCodeValue", "==", qrCodeValue).get();
                        
                        if (querySnapshot.empty) {
                            this.scanResultMessage = "無効なQRコードです。";
                            this.scanResultClass = "alert-warning";
                            return;
                        }

                        const questDoc = querySnapshot.docs[0];
                        const questId = questDoc.id;
                        const userRef = db.collection("users").doc(this.userId);

                        await userRef.set({
                            userId: this.userId,
                            questProgress: { [questId]: "completed" }
                        }, { merge: true });

                        this.scanResultMessage = `クエスト「${questDoc.data().title}」をクリアしました！`;
                        this.scanResultClass = "alert-success";
                    }

                } catch (error) {
                    console.error("QRコード処理エラー:", error);
                    this.scanResultMessage = "QRコードの処理中にエラーが発生しました。";
                    this.scanResultClass = "alert-danger";
                }
            },
            downloadCompletedStamp() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const base = new Image();
                base.crossOrigin = "anonymous";
                base.src = 'images/stamp_base.png';

                base.onload = () => {
                    canvas.width = base.width;
                    canvas.height = base.height;
                    ctx.drawImage(base, 0, 0);
                    const layers = this.completedStamps;
                    let loadedLayers = 0;
                    if (layers.length === 0) {
                        this.triggerDownload(canvas);
                        return;
                    }
                    layers.forEach(layerSrc => {
                        const layer = new Image();
                        layer.crossOrigin = "anonymous";
                        layer.src = layerSrc;
                        layer.onload = () => {
                            ctx.drawImage(layer, 0, 0, base.width, base.height);
                            loadedLayers++;
                            if (loadedLayers === layers.length) {
                                this.triggerDownload(canvas);
                            }
                        };
                    });
                };
            },
            triggerDownload(canvas) {
                const link = document.createElement('a');
                link.download = '完成スタンプ.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            },
            async generateRewardCode() {
                this.isTokenLoading = true;
                try {
                    const code = Math.floor(100000 + Math.random() * 900000).toString();
                    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

                    await db.collection('rewardTokens').doc(code).set({
                        userId: this.userId,
                        status: 'unused',
                        expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt)
                    });
                    this.rewardCode = code;
                } catch (error) {
                    console.error("報酬コードの発行に失敗:", error);
                    alert("エラーが発生しました。時間をおいて再度お試しください。");
                } finally {
                    this.isTokenLoading = false;
                }
            }
        }
    });
    window.pwaVueApp = app.mount('#app');
}