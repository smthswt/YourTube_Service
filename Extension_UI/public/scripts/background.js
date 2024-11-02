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

//subscriptionVideos.json -> flask랑 연결된 파일명
//newvideos.json
// newvideos_final.json -> 임의로 넣어둔 것 gpt api로 카테고리 나눈 것.
// chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
//     if (request.action === "fetchData") {
//         fetch(chrome.runtime.getURL('data/subscriptionVideos.json'))
//             .then(response => response.json())
//             .then(data => sendResponse({ success: true, data: data }))
//             .catch(error => sendResponse({ success: false, error: error }));
//         return true; // Will respond asynchronously
//     }
// });

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


