"use client";

import { useEffect, useState } from "react";
import InstallPwa from "./InstallPwa";
import s from "./marketing/Install.module.css";

type Platform = "ios" | "android";

// Add-to-Home-Screen instructions for the web app. On a phone we detect the
// platform and show only its steps (with a switch) so the section stays short;
// anywhere we can't tell (desktop, unknown UA) both render side by side.
export default function InstallGuide() {
  const [show, setShow] = useState<Platform | null>(null);

  useEffect(() => {
    // The server render can't know the UA, so this runs after hydration —
    // deferred a tick rather than setting state synchronously in the effect,
    // which would cascade a second render inside the commit.
    const id = setTimeout(() => {
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/.test(ua)) setShow("ios");
      else if (/Android/.test(ua)) setShow("android");
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const ios = (
    <div className={s.platform}>
      <div className={s.platformName}>iPhone and iPad</div>
      <ol className={s.steps}>
        <li><span>Open this page in <b>Safari</b>.</span></li>
        <li><span>Tap <b>Share</b> (the square with an arrow).</span></li>
        <li><span>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>
      </ol>
    </div>
  );
  const android = (
    <div className={s.platform}>
      <div className={s.platformName}>Android</div>
      <ol className={s.steps}>
        <li><span>Open this page in <b>Chrome</b>.</span></li>
        <li><span>Tap the <b>menu</b> (three dots, top right).</span></li>
        <li><span>Choose <b>Add to Home screen</b>, then <b>Install</b>.</span></li>
      </ol>
    </div>
  );

  return (
    <div>
      <div className={`${s.grid} ${show ? s.single : ""}`}>
        {show !== "android" && ios}
        {show !== "ios" && android}
      </div>
      {show && (
        <button type="button" className={s.swap} onClick={() => setShow(show === "ios" ? "android" : "ios")}>
          On {show === "ios" ? "Android" : "iPhone"}? Show those steps
        </button>
      )}
      <InstallPwa />
    </div>
  );
}
