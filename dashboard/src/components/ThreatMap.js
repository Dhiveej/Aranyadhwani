import React from 'react';
import MapComponent from '../MapComponent';

const heatRegions = [
  {left: 120, top: 180},
  {left: 260, top: 60},
  {left: 340, top: 300},
  {left: 180, top: 340},
  {left: 300, top: 200}
];

const ThreatMap = ({ alerts }) => (
  <div className="map-section">
    <div className="map-title">Aranyadhwani</div>
    <div className="map-container" style={{position:'relative'}}>
      {/* Simulate five heat regions */}
      {heatRegions.map((region, i) =>
        <div className="heat-region"
             key={i}
             style={{
               left: region.left,
               top: region.top,
               background: "radial-gradient(circle at center, #f85149 65%, #ffaf0020 100%)",
               width: 120 + 28*(i % 3) + 'px',
               height: 120 + 28*(i % 2) + 'px',
               opacity: 0.7,
               filter: 'blur(22px)'
             }} />)}
      {/* MapComponent background */}
      <MapComponent alerts={alerts} />
    </div>
  </div>
);

export default ThreatMap;

