// Fill a running Cooking Planner with made-up plans, for screenshots and trying the UI.
// Usage: node scripts/demo-data.mjs [http://localhost:8000]   (or: npm run demo)
const base = process.argv[2] ?? "http://localhost:8000";
const api = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};
const year = new Date().getFullYear();

async function makePlan(name, anchorTime, mode, groups, asTemplate = false) {
  // replace an earlier copy, so the script can be re-run
  for (const p of await api("GET", "/api/plans")) if (p.name === name) await api("DELETE", `/api/plans/${p.id}`);
  const doc = await api("POST", "/api/plans", { name, mode, anchorTime });
  const id = doc.plan.id;
  const ids = {};
  let order = 0;
  doc.groups = groups.map(([gname, color], gi) => ({ id: crypto.randomUUID(), planId: id, name: gname, color, sortOrder: gi }));
  doc.tasks = [];
  doc.deps = [];
  groups.forEach(([, , tasks], gi) => {
    for (const [key, tname, start, dur, kind = "task", after, notes = "", equipment = null, ovenTemp = null] of tasks) {
      const tid = crypto.randomUUID();
      ids[key] = tid;
      doc.tasks.push({ id: tid, planId: id, groupId: doc.groups[gi].id, kind, name: tname, startMin: start, durationMin: dur,
        color: null, notes, sortOrder: order++, status: "pending", actualStartAt: null, actualDoneAt: null, equipment, ovenTemp });
      if (after) doc.deps.push({ planId: id, predecessorId: ids[after], successorId: tid });
    }
  });
  if (asTemplate) doc.plan.isTemplate = true;
  await api("PUT", `/api/plans/${id}`, doc);
  return id;
}

const christmas = [
  ["Turkey", "#A03A3A", [
    ["t1", "Take turkey out of fridge", 0, 60],
    ["t2", "Roast turkey", 60, 210, "task", "t1", "Baste every 30 min", "oven-1", 180],
    ["t3", "Rest the turkey", 270, 40, "wait", "t2"],
    ["t4", "Carve", 310, 20, "task", "t3"]]],
  ["Potatoes", "#94742C", [
    ["p1", "Peel and parboil potatoes", 150, 30, "task", undefined, "", "hob"],
    ["p2", "Roast potatoes", 180, 70, "task", "p1", "Turn halfway", "oven-1", 200]]],
  ["Vegetables", "#3A6B4A", [
    ["v1", "Prep sprouts and carrots", 200, 30],
    ["v2", "Steam vegetables", 290, 25, "task", "v1", "", "hob"]]],
  ["Gravy and sauces", "#56497E", [
    ["g1", "Make gravy from juices", 280, 30, "task", "t2", "", "hob"],
    ["g2", "Warm bread sauce", 300, 15, "task", undefined, "", "hob"]]],
];
await makePlan("Christmas dinner", `${year}-12-25T14:00`, "backward", christmas);
await makePlan("Sunday roast", `${year}-11-02T13:00`, "forward", christmas.slice(0, 2));
await makePlan("Christmas dinner template", `${year}-12-25T14:00`, "backward", christmas, true);
console.log("demo plans created at", base);
