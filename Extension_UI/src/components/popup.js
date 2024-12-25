/*
시각적인 기능을 담당한다.
HTML과 직접 상호작용하고, background 스크립트와 함께 API를 호출
popup.html이 index.html과 같은 의미이다.
 */

/* global chrome */

import React, {useEffect, useState} from "react";
import {Box, Button, CircularProgress, Typography} from "@mui/material";
import YourTube from "../static/YourTube_logo.png";

const Popup = ({handleSubscription, handleCategoryRequest}) => {
    const [isLoading, setIsLoading] = useState(false); // 로딩 상태 추가
    const [lastUpdatedTime, setLastUpdatedTime] = useState(null);

    // 초기화: 로컬 스토리지에서 로딩 상태 및 업데이트 시간 가져오기
    useEffect(() => {
        chrome.storage.local.get(["isLoading", "lastUpdatedTime"], (result) => {
            setIsLoading(result.isLoading || false);
            setLastUpdatedTime(result.lastUpdatedTime || null);
        });
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
                    {/*2024-06-07 14시 32분*/}
                    {lastUpdatedTime || "업데이트된 정보가 없습니다."}
                </Typography>
            </Box>

            <Box marginBottom={2}>
                {isLoading ? (
                    <Button variant={"contained"}>
                        {/*<CircularProgress indeterminate variant={"plain"} size={22} sx={{ color: '#ffffff' }}/>*/}
                        로딩 중...
                    </Button>
                ) : (
                    <Button variant={"contained"} onClick={handleFetchSubscribedVideos}>
                        구독 영상 가져오기
                    </Button>
                )}
            </Box>
            <Box marginBottom={2}>
                <Button variant={"contained"} onClick={handleCategoryRequest}>
                    카테고리 분류
                </Button>
            </Box>
        </>
    )
}

export default Popup;