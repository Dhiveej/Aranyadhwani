import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './MapComponent.css';

// Fix for default marker icons in React Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom pulsing icon for alerts
const createPulsingIcon = () => {
  return L.divIcon({
    className: 'custom-pulsing-icon',
    html: `<div class="pulsing-dot"></div><div class="inner-dot"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

const MapComponent = ({ alerts }) => {
  // Center of Bannerghatta National Park
  const position = [12.8005, 77.5795];

  return (
    <div className="map-leaflet-circle-container" style={{ width: '100%', height: '100%' }}>
      <MapContainer
        center={position}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        scrollWheelZoom={true}
        dragging={true}
        doubleClickZoom={true}
      >
        <TileLayer
          // Forest/Satellite Theme
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='&copy; <a href="http://www.esri.com/">Esri</a>'
        />
        {alerts.map(alert =>
          (alert.latitude && alert.longitude) && (
            <Marker
              key={alert.id}
              position={[alert.latitude, alert.longitude]}
              icon={createPulsingIcon()}
            >
              <Popup>
                <div style={{ textAlign: 'center', color: '#333', minWidth: '150px' }}>
                  <strong style={{ fontSize: '1.1em', display:'block', marginBottom:'6px', color: '#d32f2f' }}>
                    {alert.threat_type.replace(/_/g, ' ').toUpperCase()}
                  </strong>

                  <div style={{ fontSize: '0.9em', borderTop: '1px solid #ccc', paddingTop: '6px', marginBottom: '4px' }}>
                    Device: <strong>{alert.device_id}</strong>
                  </div>

                  {/* --- LOCATION DISPLAY ADDED HERE --- */}
                  <div style={{ fontSize: '0.85em', color: '#555', marginBottom: '4px', background: '#f0f0f0', padding: '2px', borderRadius: '4px' }}>
                    📍 {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                  </div>

                  <div style={{ fontWeight: 'bold', fontSize: '0.9em' }}>
                    Confidence: {(alert.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;