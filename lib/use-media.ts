"use client";

import { useEffect, useState } from "react";

/**
 * 좁은 화면 여부. 서버 렌더링 시에는 항상 false 를 돌려주고
 * 마운트 후에 실제 값으로 바꾼다 (하이드레이션 불일치 방지).
 */
export function useIsNarrow(query = "(max-width: 640px)"): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return narrow;
}
