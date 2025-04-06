/*
시각적인 기능을 담당한다.
HTML과 직접 상호작용하고, background 스크립트와 함께 API를 호출
popup.html이 index.html과 같은 의미이다.
 */

/* global chrome */

import React, {useEffect, useState} from "react";
import {Box, Button, Typography} from "@mui/material";
import YourTube from "../static/YourTube_logo.png";

const Popup = ({}) => {
    const [isLoading, setIsLoading] = useState(false); // flask를 통한 구독영상 로딩
    const [gcpIsLoading, setGcpIsLoading] = useState(false); //GCP 통한 카테고리 추가 영상 로딩
    const [lastUpdatedTime, setLastUpdatedTime] = useState(null);

    // 초기화: 로컬 스토리지에서 로딩 상태 및 업데이트 시간 가져오기
    useEffect(() => {
        chrome.storage.local.get(["isLoading", "GCPisLoading", "lastUpdatedTime"], (result) => {
            setIsLoading(result.isLoading || false);
            setGcpIsLoading(result.GCPisLoading || false);
            setLastUpdatedTime(result.lastUpdatedTime || null);
        });

        // Chrome Storage 변화 감지 이벤트 등록
        const onStorageChange = (changes) => {
            if (changes.isLoading) {
                setIsLoading(changes.isLoading.newValue || false);
            }
            if (changes.GCPisLoading) {
                setGcpIsLoading(changes.GCPisLoading.newValue || false);
            }
            if (changes.lastUpdatedTime) {
                setLastUpdatedTime(changes.lastUpdatedTime.newValue || null);
            }
        };

        chrome.storage.onChanged.addListener(onStorageChange);

        // Cleanup: 이벤트 리스너 제거
        return () => {
            chrome.storage.onChanged.removeListener(onStorageChange);
        };
    }, []);

    const handleFetchSubscribedVideos = () => {
        setIsLoading(true);
        chrome.runtime.sendMessage({ action: "fetchSubscribedVideos" }, (response) => {
            if (response && response.success) {
                console.log("영상 정보 가져오기 성공:", response.data);
                setLastUpdatedTime(response.lastUpdatedTime);
            } else {
                console.error("영상 정보 가져오기 실패:", response.error);
            }
            setIsLoading(false);
        });
    };

    const handleCategoryRequest = () => {
        setGcpIsLoading(true);
        chrome.runtime.sendMessage({ action: "sendToGCP" }, (response) => {
            if (response && response.success) {
                console.log("카테고리 분류 성공, 현재 시각: ", response.lastUpdatedTime);
                setLastUpdatedTime(response.lastUpdatedTime);
            } else {
                console.error("카테고리 분류 실패:", response.error);
            }
            setGcpIsLoading(false);
        });
    };

    const handleCancelRequest = () => {
        chrome.runtime.sendMessage({ action: "cancelGCP" }, (response) => {
            if (response.success) {
                console.log("✅ 요청이 중단되었습니다.");
            } else {
                console.error("❌ 요청 중단 실패");
            }
        });
    };

    return(
        <>
        <Box width={"80%"} height={"auto"} display={"flex"} justifyContent={"center"} alignItems={"center"} paddingY={2}>
                <img src={YourTube} alt={"튜브 따봉 이미지"} width={"70%"}/>
            </Box>

            <Box width={"90%"} height={"auto"} marginBottom={2}>
                <Typography fontSize={12}>
                    마지막 업데이트:
                </Typography>
                <Typography fontSize={12}>
                    {lastUpdatedTime || "업데이트된 정보가 없습니다."}
                </Typography>
            </Box>

            <Box marginBottom={2}>
                {isLoading ? (
                    <Button variant={"contained"}>
                        로딩 중...
                    </Button>
                ) : (
                    <Button variant={"contained"} onClick={handleFetchSubscribedVideos}>
                        구독 영상 가져오기
                    </Button>
                )}
            </Box>
            <Box marginBottom={1.5}>
                {gcpIsLoading ? (
                    <Button variant={"contained"} onClick={handleCancelRequest}>
                        분류 중...
                    </Button>
                ) : (
                    <Button variant={"contained"} onClick={handleCategoryRequest}>
                        카테고리 분류
                    </Button>
                )}
            </Box>

            <Box marginBottom={1.5}>
                <Typography sx={{fontSize: 12, color: "grey", textDecoration: "underline"}} display={'inline'}
                component="a"
                href="https://yourtube.my"
                target="_blank"
                rel="noopener noreferrer">
                    사용 방법 & 후원
                </Typography>
            </Box>
        </>
    )
}

export default Popup;
