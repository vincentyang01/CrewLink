import { remote } from 'electron';
import Store from 'electron-store';
import React, { useContext, useEffect, useReducer, useRef, useState } from "react";
import { SettingsContext } from "./App";
import './css/settings.css';

const keys = new Set(['Space', 'Backspace', 'Delete', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'LControl', 'LShift', 'LAlt', 'RControl', 'RShift', 'RAlt']);

const store = new Store<ISettings>({
	schema: {
		alwaysOnTop: {
			type: 'boolean',
			default: false
		},
		microphone: {
			type: 'string',
			default: 'Default'
		},
		speaker: {
			type: 'string',
			default: 'Default'
		},
		pushToTalk: {
			type: 'boolean',
			default: false,
		},
		microphoneGain: {
			type: 'number',
			default: 1
		},
		server: {
			type: 'string',
			default: 'https://crewlink.paulf.me'
		},
		pushToTalkShortcut: {
			type: 'string',
			default: 'V'
		},
		deafenShortcut: {
			type: 'string',
			default: 'RControl'
		},
		offsets: {
			type: 'object',
			properties: {
				version: {
					type: 'string',
					default: ''
				},
				data: {
					type: 'string',
					default: ''
				}
			}
		},
		hideCode: {
			type: 'boolean',
			default: false
		},
		stereo: {
			type: 'boolean',
			default: true
		}
	}
});

export interface SettingsProps {
	open: boolean;
	onClose: any;
}

export interface ISettings {
	alwaysOnTop: boolean;
	microphone: string;
	microphoneGain: number,
	speaker: string;
	pushToTalk: boolean;
	server: string;
	pushToTalkShortcut: string;
	deafenShortcut: string;
	offsets: {
		version: string;
		data: string;
	},
	hideCode: boolean;
	stereo: boolean;
}
export const settingsReducer = (state: ISettings, action: {
	type: 'set' | 'setOne', action: [string, any] | ISettings
}): ISettings => {
	if (action.type === 'set') return action.action as ISettings;
	let v = (action.action as [string, any]);
	store.set(v[0], v[1]);
	return {
		...state,
		[v[0]]: v[1]
	};
}

interface MediaDevice {
	id: string;
	kind: MediaDeviceKind;
	label: string;
}

export default function Settings({ open, onClose }: SettingsProps) {

	const [settings, setSettings] = useContext(SettingsContext);
	const [unsavedCount, setUnsavedCount] = useState(0);
	const unsaved = unsavedCount > 2;
	useEffect(() => {
		setSettings({
			type: 'set',
			action: store.store
		});
	}, []);

	useEffect(() => {
		setUnsavedCount(s => s + 1);
	}, [settings.microphone, settings.speaker, settings.server]);

	const [devices, setDevices] = useState<MediaDevice[]>([]);
	const [_, updateDevices] = useReducer((state) => state + 1, 0);
	useEffect(() => {
		navigator.mediaDevices.enumerateDevices()
			.then(devices => setDevices(devices
				.map(d => {
					let label = d.label;
					if (d.deviceId === 'default') {
						label = "Default";
					} else {
						let match = /\((.+?)\)/.exec(d.label);
						if (match && match[1])
							label = match[1];
					}
					return {
						id: d.deviceId,
						kind: d.kind,
						label
					};
				})
			));
	}, [_]);

	const setShortcut = (ev: React.KeyboardEvent<HTMLInputElement>, shortcut: string) => {
		let k = ev.key;
		if (k.length === 1) k = k.toUpperCase();
		else if (k.startsWith('Arrow')) k = k.substring(5);
		if (k === ' ') k = 'Space';

		if (k === 'Control' || k === 'Alt' || k === 'Shift')
			k = (ev.location === 1 ? 'L' : 'R') + k;

		if (/^[0-9A-Z]$/.test(k) || /^F[0-9]{1,2}$/.test(k) ||
			keys.has(k)
		) {
			setSettings({
				type: 'setOne',
				action: [shortcut, k]
			});
		}
	};

	const micFader = useRef<HTMLInputElement>(null);
	const [ micGainNode, setMicGainNode ] = useState<GainNode>();
	useEffect(() => {
		if (micGainNode) {
			micGainNode.gain.value = settings.microphoneGain;
		}
	}, [ settings.microphoneGain ]);
	useEffect(() => {
		if (!open) return;
		let monitorNode: AudioNode;
		let gainNode: AudioNode;
		let audio: boolean | MediaTrackConstraints = true;
		if (settings.microphone.toLowerCase() !== 'default')
			audio = { deviceId: settings.microphone };
		let media: MediaStream | undefined = undefined;
		navigator.getUserMedia({ video: false, audio }, async (stream) => {
			media = stream;
			const ac = new AudioContext();
			const source = ac.createMediaStreamSource(stream);
			const gain = ac.createGain();
			gain.gain.value = settings.microphoneGain;
			source.connect(gain);
			const monitor = ac.createScriptProcessor(1024, 1, 1);
			let peak = 0;
			monitor.onaudioprocess = e => {
				const data = e.inputBuffer.getChannelData(0);
				if (peak) peak -= 0.04;
				for (let i = 0; i < data.length; i++) {
					peak = Math.max(peak, Math.abs(data[i]));
				}
				micFader.current?.style.setProperty('--audio-level', (100 * peak / (+micFader.current?.max) | 0) + '%');
			};
			gain.connect(monitor);
			monitor.connect(ac.destination);
			monitorNode = monitor;
			setMicGainNode(gain);
		}, error => {
			console.log(error);
			remote.dialog.showErrorBox('Error', 'Couldn\'t connect to your microphone:\n' + error);
		});
		return () => {
			gainNode?.disconnect();
			monitorNode?.disconnect();
			media?.getTracks().forEach(t => t.stop());
		};
	}, [ open, settings.microphone ]);

	const microphones = devices.filter(d => d.kind === 'audioinput');
	const speakers = devices.filter(d => d.kind === 'audiooutput');

	return <div id="settings" style={{ transform: open ? 'translateX(0)' : 'translateX(-100%)' }}>
		<svg className="titlebar-button back" viewBox="0 0 24 24" fill="#868686" width="20px" height="20px" onClick={() => {
			if (unsaved) {
				onClose();
				location.reload();
			}
			else
				onClose();
		}}>
			<path d="M0 0h24v24H0z" fill="none" />
			<path d="M11.67 3.87L9.9 2.1 0 12l9.9 9.9 1.77-1.77L3.54 12z" />
		</svg>
		{/* <div className="form-control m" style={{ color: '#e74c3c' }} onClick={() => {
			ipcRenderer.send('alwaysOnTop', !settings.alwaysOnTop);
			setSettings({
				type: 'setOne',
				action: ['alwaysOnTop', !settings.alwaysOnTop]
			});
		}}>
			<input type="checkbox" checked={settings.alwaysOnTop} readOnly />Always on Top
		</div> */}
		<div className="settings-scroll">

			<div className="form-control m l" style={{ color: '#e74c3c' }}>
				<label>Microphone</label>
				<div className="fader-holder">
					<input ref={micFader} className="fader" type="range" min="0" max="2" step="0.05" list="volsettings" value={settings.microphoneGain} onChange={(ev) => setSettings({
						type: 'setOne',
						action: ['microphoneGain', +ev.currentTarget.value]
					})} />
					<datalist id="volsettings">
						<option>1</option>
					</datalist>
				</div>
				<select value={settings.microphone} onChange={(ev) => {
					setSettings({
						type: 'setOne',
						action: ['microphone', microphones[ev.target.selectedIndex].id]
					});
				}} onClick={() => updateDevices()}>
					{
						microphones.map(d => (
							<option key={d.id} value={d.id}>{d.label}</option>
						))
					}
				</select>
			</div>
			<div className="form-control m l" style={{ color: '#e67e22' }}>
				<label>Speaker</label>
				<select value={settings.speaker} onChange={(ev) => {
					setSettings({
						type: 'setOne',
						action: ['speaker', speakers[ev.target.selectedIndex].id]
					});
				}} onClick={() => updateDevices()}>
					{
						speakers.map(d => 
							<option key={d.id} value={d.id}>{d.label}</option>
						)
					}
				</select>
			</div>
			<div className="form-control m" style={{ color: '#f1c40f' }} onClick={() => setSettings({
				type: 'setOne',
				action: ['pushToTalk', false]
			})}>
				<input type="checkbox" checked={!settings.pushToTalk} style={{ color: '#f1c40f' }} readOnly />
				<label>Voice Activity</label>
			</div>
			<div className={`form-control${settings.pushToTalk ? '' : ' m'}`} style={{ color: '#f1c40f' }} onClick={() => setSettings({
				type: 'setOne',
				action: ['pushToTalk', true]
			})}>
				<input type="checkbox" checked={settings.pushToTalk} readOnly />
				<label>Push to Talk</label>
			</div>
			{settings.pushToTalk &&
				<div className="form-control m" style={{ color: '#f1c40f' }}>
					<input spellCheck={false} type="text" value={settings.pushToTalkShortcut} readOnly onKeyDown={(ev) => setShortcut(ev, 'pushToTalkShortcut')} />
				</div>
			}
			<div className="form-control l m" style={{ color: '#2ecc71' }}>
				<label>Deafen Shortcut</label>
				<input spellCheck={false} type="text" value={settings.deafenShortcut} readOnly onKeyDown={(ev) => setShortcut(ev, 'deafenShortcut')} />
			</div>
			<div className="form-control l m" style={{ color: '#3498db' }}>
				<label>Voice Server</label>
				<input spellCheck={false} type="text" onChange={(ev) => setSettings({
					type: 'setOne',
					action: ['server', ev.target.value]
				})} value={settings.server} />
			</div>
			<div className="form-control m" style={{ color: '#9b59b6' }} onClick={() => setSettings({
				type: 'setOne',
				action: ['hideCode', !settings.hideCode]
			})}>
				<input type="checkbox" checked={!settings.hideCode} style={{ color: '#9b59b6' }} readOnly />
				<label>Show Lobby Code</label>
			</div>
			<div className="form-control m" style={{ color: '#fd79a8' }} onClick={() => setSettings({
				type: 'setOne',
				action: ['stereo', !settings.stereo]
			})}>
				<input type="checkbox" checked={settings.stereo} style={{ color: '#fd79a8' }} readOnly />
				<label>Stereo Audio</label>
			</div>
		</div>
	</div>
}
