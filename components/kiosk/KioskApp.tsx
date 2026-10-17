"use client"; // uses state, which only works in the browser

import { useState } from "react";
import WelcomeScreen from "./WelcomeScreen";
import IdentifyScreen from "./IdentifyScreen";
import PinScreen from "./PinScreen";

// every screen the kiosk can show. we add names here as we build them
export type Screen = "welcome" | "identify" | "pin";

export default function KioskApp() {
	const [screen, setScreen] = useState<Screen>("welcome");

	if (screen === "welcome") {
		return <WelcomeScreen onCheckIn={() => setScreen("identify")} />;
	}
	if (screen === "identify") {
		return (
			<IdentifyScreen
				onBack={() => setScreen("welcome")}
				onPick={(id) => {
					if (id === "pin") setScreen("pin"); // qr and search come later
				}}
			/>
		);
	}
	// screen === "pin"
	return (
		<PinScreen
			onBack={() => setScreen("identify")}
			onSubmit={(code) => console.log("code entered:", code)} // next step: look it up in odoo
		/>
	);
}
