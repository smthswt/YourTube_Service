/* global chrome */
/*
브라우저 영역에서 작동하는 스크립트.
플러그인의 이벤트 핸들러
중요한 모든 이벤트 리스너가 여기 저장된다.
이벤트가 트리거 되고, 할당된 로직을 실행할 때까지 inactive 상태로 유지된다.
 */
// 매일 두번 (임시) 아침 8시, 밤 12시 alarm 기능으로 API 가져와서 자동 ML 업데이트 진행
// 1) 알림 관리
// 2) API 호출 및 데이터 동기화
//3) 강력 새로고침

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "forceReload") {
        chrome.tabs.reload(sender.tab.id, { bypassCache: true }, () => {
            chrome.tabs.sendMessage(sender.tab.id, { action: "runReplace" });
        });
    }
});

// 로컬 스토리지에 있는 영상 시각화
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📩 메시지 수신:", request);

    if (request.action === "fetchData") {
        // chrome.storage.local에서 subscribedVideos 데이터 가져오기
        chrome.storage.local.get('subscribedVideos', (result) => {
            if (chrome.runtime.lastError) {
                // 오류가 있는 경우
                sendResponse({ success: false, error: chrome.runtime.lastError });
            } else if (result.subscribedVideos) {
                // 데이터가 존재하는 경우
                sendResponse({ success: true, data: result.subscribedVideos });
            } else {
                // 데이터가 없는 경우
                sendResponse({ success: false, error: "No data found in storage" });
            }
        });
        return true; // Will respond asynchronously
    }
});

// ⏳ OAuth 진행 중인지 확인하는 변수 추가
let isAuthenticating = false;

// ✅ OAuth 인증 + 비디오 데이터 가져오기 (하나의 함수로 통합)
const authenticateAndFetchVideos = () => {
    console.log("🔄 authenticateAndFetchVideos() 실행 중...");

    // ⏳ 요청 시작 전에 로딩 상태 설정
    chrome.storage.local.set({ isLoading: true }, () => {
        console.log("⏳ 로딩 상태 설정: 시작");
    });

    fetchWithTimeout("https://yourtube.store/api/videos/subscribed", {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            if (response.status === 401) {
                console.warn("⚠️ 인증이 필요합니다. OAuth 실행 중...");

                if (!isAuthenticating) {
                    isAuthenticating = true;
                    fetchOAuthUrl()
                        .then(() => {
                            console.log("✅ OAuth 인증 완료, 다시 fetchVideos 실행");
                            authenticateAndFetchVideos(); // 인증 후 재요청
                        })
                        .catch((err) => console.error("❌ OAuth 실패:", err))
                        .finally(() => (isAuthenticating = false));

                    return null; // 이후 코드 실행 방지
                }
            }
            if (response.status === 429) {
                console.warn("⚠️ 너무 많은 요청 (429). 10초 후 재시도...");
                setTimeout(authenticateAndFetchVideos, 10000); // 10초 후 재시도
                return;
            }
            return response.json();
        })
        .then((data) => {
            if (!data) return;
            if (data.videos) {
                const now = new Date();
                const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}, ${String(now.getHours()).padStart(2, '0')}시 ${String(now.getMinutes()).padStart(2, '0')}분`;

                chrome.storage.local.set(
                    { subscribedVideos: data.videos, lastUpdatedTime: formattedDate },
                    () => {
                        console.log("✅ 비디오 데이터 저장 완료:", data.videos);
                        chrome.storage.local.remove("isLoading");
                        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                            if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
                        });
                    }
                );
            } else {
                console.error("❌ 비디오 데이터 없음:", data);
                chrome.storage.local.remove("isLoading");
            }
        })
        .catch((error) => {
            console.error("❌ 비디오 데이터 가져오기 실패:", error.message);
            chrome.storage.local.remove("isLoading");
        });
};

// ✅ OAuth 인증 URL 가져오기
const fetchOAuthUrl = () => {
    console.log("🔑 fetchOAuthUrl() 실행 중...");

    return new Promise((resolve, reject) => {
        fetchWithTimeout("https://yourtube.store/api/videos/subscribed", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        })
            .then((response) => {
                if (response.status === 401) return response.json();
                if (response.status === 429) {
                    console.warn("⚠️ 너무 많은 요청 (429). 10초 후 재시도...");
                    setTimeout(fetchOAuthUrl, 10000); // 10초 후 재시도
                    return;
                }
                throw new Error(`❌ 네트워크 오류: 상태 코드 ${response.status}`);
            })
            .then((data) => {
                if (!data.authorization_url) throw new Error("❌ Authorization URL이 응답에 포함되지 않음");

                console.log("🔑 OAuth 인증 URL:", data.authorization_url);
                chrome.tabs.create({ url: data.authorization_url }, (tab) => {
                    if (chrome.runtime.lastError) {
                        reject("❌ Google 인증 창 열기 실패: " + chrome.runtime.lastError);
                    } else {
                        console.log("✅ Google 인증 창 열림:", tab);

                        // ✅ 인증 후 자동으로 fetchVideos 실행
                        setTimeout(() => {
                            console.log("🔄 OAuth 인증 후 비디오 가져오기 실행...");
                            resolve(); // 인증 완료 신호
                        }, 5000);
                    }
                });
            })
            .catch(reject);
    });
};

// ✅ 타임아웃 함수
const fetchWithTimeout = (url, options, timeout = 20000) => {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error("❌ Request timed out")), timeout)),
    ]);
};

// ✅ 메시지 리스너 (백그라운드 스크립트에서 실행)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetchSubscribedVideos") {
        console.log("🚀 Service Worker에서 구독 영상 가져오기 실행");
        authenticateAndFetchVideos();
        return true; // 비동기 응답
    }
});


// const GCP_CLOUD_RUN_URL = chrome.runtime.getManifest().env?.GCP_CLOUD_RUN_URL;

// // 🔴 전송 중단을 위한 AbortController
// let abortController = new AbortController();

// // ✅ GCP로 데이터 전송 (카테고리 분류 요청)
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.action === "sendToGCP") {
//         console.log("📡 GCP 카테고리 분류 요청 시작");

//         abortController = new AbortController(); // 새로운 컨트롤러 생성 (기존 요청 무효화)
//         chrome.storage.local.set({ GCPisLoading: true });

//         chrome.storage.local.get("subscribedVideos", async (result) => {
//             if (!result.subscribedVideos || result.subscribedVideos.length === 0) {
//                 console.error("❌ 저장된 데이터 없음");
//                 chrome.storage.local.remove("GCPisLoading");
//                 sendResponse({ success: false, error: "No data found" });
//                 return;
//             }

//             const formattedData = result.subscribedVideos.map(video => ({
//                 ...video,
//                 thumbnail: Array.isArray(video.thumbnail) ? video.thumbnail[0] : video.thumbnail
//             }));

//             const CHUNK_SIZE = 50;
//             const videoChunks = [];
//             for (let i = 0; i < formattedData.length; i += CHUNK_SIZE) {
//                 videoChunks.push(formattedData.slice(i, i + CHUNK_SIZE));
//             }

//             console.log(`🚀 총 ${videoChunks.length}개의 배치 전송`);

//             let allResults = [];

//             for (const [index, chunk] of videoChunks.entries()) {
//                 console.log(`📦 배치 ${index + 1}/${videoChunks.length} 전송`);

//                 try {
//                     if (index > 0) await new Promise(resolve => setTimeout(resolve, 100000));

//                     const response = await fetch(GCP_CLOUD_RUN_URL, {
//                         method: 'POST',
//                         headers: { "Content-Type": "application/json" },
//                         body: JSON.stringify({ userId: "Subscribed_Videos", videos: chunk }),
//                         signal: abortController.signal // 📌 AbortController 적용
//                     });

//                     if (!response.ok) throw new Error(`🚨 배치 ${index + 1} 전송 실패`);

//                     const responseData = await response.json();
//                     console.log(`Batch ${index + 1} Response:`, responseData);
//                     allResults = allResults.concat(responseData.videos);

//                 } catch (error) {
//                     if (error.name === "AbortError") {
//                         console.warn("🛑 요청이 중단되었습니다.");
//                         chrome.storage.local.remove("GCPisLoading");
//                         return;
//                     } else {
//                         console.error(`❌ 배치 ${index + 1} 실패:`, error);
//                     }
//                 }
//             }

//             const now = new Date();
//             const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}, ${String(now.getHours()).padStart(2, '0')}시 ${String(now.getMinutes()).padStart(2, '0')}분`;

//             chrome.storage.local.set({ subscribedVideos: allResults, lastUpdatedTime: formattedDate }, () => {
//                 console.log("✅ 데이터 저장 완료");
//                 console.log("전체 데이터 : ", allResults);
//                 console.log("저장 시각 : ", formattedDate);

//                 chrome.storage.local.remove("GCPisLoading", () => {
//                     console.log("🟢 GCPisLoading 제거 완료");

//                     chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//                         if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
//                     });

//                     sendResponse({ success: true, lastUpdatedTime: formattedDate });
//                 });
//             });
//         });

//         return true;
//     }

//     // 🛑 요청 중단 기능 추가
//     if (message.action === "cancelGCP") {
//         console.log("🛑 GCP 데이터 전송 요청 취소");
//         abortController.abort(); // 현재 진행 중인 요청 중단
//         chrome.storage.local.remove("GCPisLoading"); // UI 상태 해제
//         sendResponse({ success: true, message: "GCP 요청 중단됨" });
//     }
// });
