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

// 서버를 통해 유튜브api로 구독 영상 가져오는 작업
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "fetchSubscribedVideos") {
        console.log("백그라운드에서 구독 영상 가져오기 실행");

        chrome.storage.local.set({ isLoading: true });

        // 타임아웃 설정 (20초)
        const fetchWithTimeout = (url, options, timeout = 20000) => {
            return Promise.race([
                fetch(url, options),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Request timed out")), timeout)
                )
            ]);
        };

        fetchWithTimeout("https://yourtube.store/api/videos/subscribed", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                return response.json();
            })
            .then((data) => {
                const now = new Date();
                const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
                    now.getDate()
                ).padStart(2, '0')}, ${String(now.getHours()).padStart(2, '0')}시 ${String(
                    now.getMinutes()
                ).padStart(2, '0')}분`;

                chrome.storage.local.set(
                    {
                        subscribedVideos: data.videos,
                        lastUpdatedTime: formattedDate,
                    },
                    () => {
                        console.log("백그라운드에서 데이터 저장 완료:", data.videos);
                        console.log("업데이트 시각 저장 완료:", formattedDate);

                        chrome.storage.local.remove("isLoading", () => {
                            console.log("로딩 상태 키 삭제 완료");
                            sendResponse({ success: true, data: data.videos, lastUpdatedTime: formattedDate });

                            // 새로고침 실행
                            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                                if (tabs[0]?.id) {
                                    chrome.tabs.reload(tabs[0].id, { bypassCache: true }, () => {
                                        console.log("탭 새로고침 완료");
                                    });
                                } else {
                                    console.error("활성 탭을 찾을 수 없습니다.");
                                }
                            });
                        });
                    }
                );
            })
            .catch((error) => {
                console.error("Failed to fetch:", error);

                chrome.storage.local.remove("isLoading", () => {
                    console.log("로딩 상태 키 삭제 완료");
                    sendResponse({ success: false, error: error.message });
                });
            });

        return true; // 비동기 응답을 보장
    }
});
