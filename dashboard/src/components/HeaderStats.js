import React from 'react';

const cardClasses = [
  "stat-card alerts",
  "stat-card sensors",
  "stat-card response",
  "stat-card uptime"
];
const statTitles = ["ALERTS TODAY", "ACTIVE SENSORS", "AVG RESPONSE TIME", "SYSTEM UPTIME"];

const HeaderStats = ({ stats }) => {
  const values = [
    stats.alertsToday,
    `${stats.activeSensors}/250`,
    stats.avgResponseTime,
    stats.systemUptime
  ];
  return (
    <div className="stats-bar">
      {values.map((value, i) => (
        <div className={cardClasses[i]} key={i}>
          <div className="stat-title">{statTitles[i]}</div>
          <div className="stat-value">{value}</div>
        </div>
      ))}
    </div>
  );
};
export default HeaderStats;

