import { useState } from "react";

export default function SettingsGroup({ title, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className={`settings-group ${open ? "open" : ""}`}>
            <button
                type="button"
                className="settings-group-header"
                onClick={() => setOpen(!open)}
            >
                <span>{title}</span>
                <span className="chevron">{open ? "▾" : "▸"}</span>
            </button>

            <div className="settings-group-body">
                {children}
            </div>
        </div>
    );
}