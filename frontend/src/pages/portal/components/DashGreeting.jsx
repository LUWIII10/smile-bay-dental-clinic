function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Solid navy-to-blue card with a wave-line motif along the bottom edge,
// echoing the wave lines under the tooth in the Smile Bay logo itself
// (the "Bay") rather than a generic faint tooth watermark. Approved design:
// https://claude.ai/artifact/Wx6vx4t9izLi8jN7QXb4RU (Option A, no logo mark).
function DashGreeting({ firstName }) {
  return (
    <div className="dash-greeting">
      <svg className="dash-greeting-wave dash-greeting-wave--back" viewBox="0 0 900 44" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,26 C75,6 150,46 225,26 C300,6 375,46 450,26 C525,6 600,46 675,26 C750,6 825,46 900,26 L900,44 L0,44 Z" />
      </svg>
      <svg className="dash-greeting-wave dash-greeting-wave--front" viewBox="0 0 900 30" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,16 C75,2 150,30 225,16 C300,2 375,30 450,16 C525,2 600,30 675,16 C750,2 825,30 900,16 L900,30 L0,30 Z" />
      </svg>
      <h2>{getGreeting()}, {firstName}</h2>
      <p>{formatToday()}</p>
    </div>
  );
}

export default DashGreeting;
