import React from 'react';

const getThreatIcon = (type) => {
  switch (type) {
    case 'gunshot': return <span className="alert-icon">🔥</span>;
    case 'chainsaw': return <span className="alert-icon">🪚</span>;
    case 'vehicle_truck': return <span className="alert-icon">🚚</span>;
    case 'animal_tiger': return <span className="alert-icon">🐅</span>;
    default: return <span className="alert-icon">❓</span>;
  }
};

const formatSector = (alert) =>
  alert.sector ? `Sector ${alert.sector}` : (alert.device_id ? alert.device_id : 'Unknown Device');

const AlertFeed = ({ alerts }) => (
  <div className="alert-feed">
    <div className="alert-feed-title">Live Alert Feed</div>
    <div className="alert-list">
      {alerts.length > 0 ? alerts.map((alert) => (
        <div key={alert.id} className="alert-item" data-threat={alert.threat_type}>
          {getThreatIcon(alert.threat_type)}

          <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
             <span className="alert-type">
               {alert.threat_type ? alert.threat_type.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN'}
             </span>
             <span className="alert-details">{formatSector(alert)} | {alert.confidence ? (alert.confidence * 100).toFixed(0) + '%' : ''}</span>
          </div>

          <span className="alert-time">
            {/* Use the pre-processed createdAt date we made in App.js */}
            {alert.createdAt ? alert.createdAt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
          </span>
        </div>
      )) : (
        <p style={{ textAlign: 'center', color: '#8b949e', marginTop: '20px' }}>Awaiting sensor data...</p>
      )}
    </div>
  </div>
);

export default AlertFeed;