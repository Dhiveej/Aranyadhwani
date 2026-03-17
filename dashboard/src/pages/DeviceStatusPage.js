import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import './DeviceStatusPage.css';

// Helper function to determine status based on last heartbeat
const getStatus = (lastHeartbeat) => {
    if (!lastHeartbeat) return { text: 'Offline', className: 'offline' };

    const now = new Date();
    const lastSeen = lastHeartbeat.toDate();
    const diffMinutes = (now - lastSeen) / (1000 * 60);

    if (diffMinutes > 10) { // If last seen more than 10 mins ago
        return { text: 'Offline', className: 'offline' };
    }
    return { text: 'Online', className: 'online' };
};

const DeviceStatusPage = () => {
    const [devices, setDevices] = useState([]);

    useEffect(() => {
        const q = query(collection(db, 'devices'), orderBy('last_heartbeat', 'desc'));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const devicesData = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    statusInfo: getStatus(data.last_heartbeat),
                };
            });
            setDevices(devicesData);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className="device-status-page">
            <div className="page-header">
                <h1>Device Status</h1>
                <p>Real-time health of all connected IoT nodes.</p>
            </div>

            <div className="device-list-container">
                <div className="device-list-header">
                    <div>Device</div>
                    <div>Status</div>
                    <div>Battery</div>
                    <div>Signal</div>
                    <div>Last Heartbeat</div>
                </div>
                <div className="device-list-body">
                    {devices.map(device => (
                        <div key={device.id} className="device-row">
                            <div>{device.id}</div>
                            <div>
                                <span className={`status-badge ${device.statusInfo.className}`}>
                                    {device.statusInfo.text}
                                </span>
                            </div>
                            <div className="battery-cell">
                                <span>{device.battery}%</span>
                                <div className="progress-bar-container">
                                    <div
                                        className="progress-bar"
                                        style={{ width: `${device.battery}%` }}
                                    ></div>
                                </div>
                            </div>
                            <div>{device.signal}%</div>
                            <div>{device.last_heartbeat ? device.last_heartbeat.toDate().toLocaleString() : 'Never'}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DeviceStatusPage;