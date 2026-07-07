"use client";

import { useEffect, useState } from "react";
import InstallPwa from "./InstallPwa";

type Platform = "ios" | "android";

// Install instructions. On a phone we detect the platform and show only its
// steps (with a swap link) so the page stays a short scroll; anywhere we can't
// tell (desktop, unknown UA) both platforms render side by side.
export default function InstallGuide() {
  const [show, setShow] = useState<Platform | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/.test(ua)) setShow("ios");
      else if (/Android/.test(ua)) setShow("android");
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const ios = (
    <div className="pr-w-platform">
      <div className="pr-w-platform-name">iPhone / iPad</div>
      <ol className="pr-w-steps">
        <li>Open this page in <b>Safari</b></li>
        <li>Tap the <b>Share</b> button (the square with an arrow)</li>
        <li>Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b></li>
      </ol>
    </div>
  );
  const android = (
    <div className="pr-w-platform">
      <div className="pr-w-platform-name">Android</div>
      <ol className="pr-w-steps">
        <li>Open this page in <b>Chrome</b></li>
        <li>Tap the <b>⋮ menu</b> in the top right</li>
        <li>Tap <b>Add to Home screen</b>, then <b>Install</b></li>
      </ol>
    </div>
  );

  return (
    <>
      <div className={`pr-w-install-grid ${show ? "is-single" : ""}`}>
        {show !== "android" && ios}
        {show !== "ios" && android}
      </div>
      {show && (
        <button className="pr-w-swap" onClick={() => setShow(show === "ios" ? "android" : "ios")}>
          On {show === "ios" ? "Android" : "iPhone"} instead? Show those steps →
        </button>
      )}
      <InstallPwa />
    </>
  );
}
