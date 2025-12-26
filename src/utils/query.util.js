export const buildDateFilter = (from, to) => {
  const f = {};
  if (from) f.$gte = new Date(from);
  if (to) f.$lte = new Date(to);
  return Object.keys(f).length ? f : null;
};
