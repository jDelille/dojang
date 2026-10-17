"use client"; // uses state, which only works in the browser

import { useState } from "react";
import WelcomeScreen from "./WelcomeScreen";
import IdentifyScreen from "./IdentifyScreen";

// every screen the kiosk can show. we add names here as we build them
export type Screen = "welcome" | "identify";

export default function KioskApp() {
	const [screen, setScreen] = useState<Screen>("welcome"); // starts on welcome

	// show the screen that matches the current state
	return screen === "welcome" ? (
		<WelcomeScreen onCheckIn={() => setScreen("identify")} />
	) : (
		<IdentifyScreen onBack={() => setScreen("welcome")} />
	);
}
