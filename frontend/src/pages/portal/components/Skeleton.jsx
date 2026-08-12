// Shimmering placeholder used everywhere a dashboard is waiting on data,
// instead of a plain spinner. `variant` picks a shape; `count` repeats it
// (e.g. several skeleton rows while a table loads).
function Skeleton({ variant = 'line', width, height, count = 1 }) {
  const style = {
    width: width ?? undefined,
    height: height ?? undefined,
  };

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className={`skeleton skeleton--${variant}`} style={style} />
      ))}
    </>
  );
}

export default Skeleton;
