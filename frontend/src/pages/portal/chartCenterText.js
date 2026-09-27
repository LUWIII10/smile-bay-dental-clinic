// Chart.js plugin: draws the segment total in the doughnut's own hole.
// Shared by AdminDashboard's Appointment Breakdown and Reports' Payment Type
// Split doughnuts — same visual treatment, each computes its own total from
// whatever data it's already been given (nothing hardcoded/fabricated).
export function centerTextPlugin(label = 'TOTAL') {
  return {
    id: 'centerText',
    afterDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) return;
      const total = chart.data.datasets[0].data.reduce((sum, value) => sum + value, 0);
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0f2557';
      ctx.font = "700 26px 'Poppins', sans-serif";
      ctx.fillText(String(total), cx, cy - 9);
      ctx.fillStyle = '#94a3b8';
      ctx.font = "600 10px 'Poppins', sans-serif";
      ctx.fillText(label, cx, cy + 13);
      ctx.restore();
    },
  };
}
