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
// 3) 강력 새로고침


// Force reload: 브라우저 탭을 강제로 새로고침
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "forceReload") {
        chrome.tabs.reload(sender.tab.id, { bypassCache: true }, () => {
            chrome.tabs.sendMessage(sender.tab.id, { action: "runReplace" });
        });
    }
});

// 로컬 스토리지에서 데이터 가져오기
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
                console.warn("⚠️ 인증이 필요합니다. OAuth를 실행합니다.");

                if (!isAuthenticating) {
                    isAuthenticating = true;
                    fetchOAuthUrl(); // OAuth 인증 실행
                }
                return;
            }
            if (!response.ok) {
                throw new Error(`❌ 네트워크 오류: 상태 코드 ${response.status}`);
            }
            return response.json();
        })
        .then((data) => {
            if (data && data.videos) {
                const now = new Date();
                const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
                    now.getDate()
                ).padStart(2, '0')}, ${String(now.getHours()).padStart(2, '0')}시 ${String(
                    now.getMinutes()
                ).padStart(2, '0')}분`;

                chrome.storage.local.set(
                    { subscribedVideos: data.videos, lastUpdatedTime: formattedDate },
                    () => {
                        console.log("✅ 비디오 데이터 저장 완료:", data.videos);
                        console.log("✅ 업데이트 시각 저장 완료:", formattedDate);

                        // ✅ 로딩 상태 해제
                        chrome.storage.local.remove("isLoading", () => {
                            console.log("✅ 로딩 상태 키 삭제 완료");

                            // 🔄 새로고침 실행
                            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                                if (tabs[0]?.id) {
                                    chrome.tabs.reload(tabs[0].id, { bypassCache: true }, () => {
                                        console.log("🔄 탭 새로고침 완료");
                                    });
                                } else {
                                    console.error("❌ 활성 탭을 찾을 수 없습니다.");
                                }
                            });
                        });
                    }
                );
            } else {
                console.error("❌ 비디오 데이터 없음:", data);
                chrome.storage.local.remove("isLoading", () => {
                    console.log("✅ 로딩 상태 키 삭제 완료");
                });
            }
        })
        .catch((error) => {
            console.error("❌ 비디오 데이터 가져오기 실패:", error.message);
            chrome.storage.local.remove("isLoading", () => {
                console.log("✅ 로딩 상태 키 삭제 완료");
            });
        });
};

// ✅ OAuth 인증 URL 가져오기
const fetchOAuthUrl = () => {
    console.log("🔑 fetchOAuthUrl() 실행 중...");

    fetchWithTimeout("https://yourtube.store/api/videos/subscribed", {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then((response) => {
            if (response.status === 401) {
                return response.json(); // 다음 then에서 authorization_url 처리
            }
            if (!response.ok) {
                throw new Error(`❌ 네트워크 오류: 상태 코드 ${response.status}`);
            }
            return response.json();
        })
        .then((data) => {
            if (data.authorization_url) {
                console.log("🔑 OAuth 인증 URL:", data.authorization_url);
                chrome.tabs.create({ url: data.authorization_url }, (tab) => {
                    if (chrome.runtime.lastError) {
                        console.error("❌ Google 인증 창 열기 실패:", chrome.runtime.lastError);
                    } else {
                        console.log("✅ Google 인증 창 열림:", tab);

                        // ✅ 인증 후 자동으로 fetchVideos 실행
                        setTimeout(() => {
                            console.log("🔄 OAuth 인증 후 비디오 가져오기 실행...");
                            authenticateAndFetchVideos();
                            isAuthenticating = false;
                        }, 5000);
                    }
                });
            } else {
                throw new Error("❌ Authorization URL이 응답에 포함되지 않았습니다.");
            }
        })
        .catch((error) => {
            console.error("❌ OAuth 프로세스 실패:", error.message);
            chrome.storage.local.remove("isLoading", () => {
                console.log("✅ 로딩 상태 키 삭제 완료");
            });
            isAuthenticating = false;
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