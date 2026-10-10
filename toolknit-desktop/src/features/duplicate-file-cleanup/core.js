export const GROUP_PAGE_SIZE = 10;
export const FILE_PAGE_SIZE = 30;
export function sortGroups(groups) {
  return [...groups].sort((a, b) => b.files[0].size_bytes * (b.files.length - 1) - a.files[0].size_bytes * (a.files.length - 1) || a.id.localeCompare(b.id));
}

export function initialKeepers(groups) {
  return new Map(groups.map(group => [group.id, [...group.files].sort((a, b) =>
    (a.modified_at ?? Infinity) - (b.modified_at ?? Infinity) || a.path.localeCompare(b.path))[0]?.path]));
}
export function selectExtras(groups, keepers) {
  return new Set(groups.flatMap(group => group.files.filter(file => file.path !== keepers.get(group.id)).map(file => file.path)));
}
export function toggleFileSelection(group, keepers, selected, path) {
  if (!group.files.some(file => file.path === path)) throw new Error('invalid-member');
  const next = new Set(selected);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  const retained = group.files.filter(file => !next.has(file.path));
  if (!retained.length) return { selected, keepPath: keepers.get(group.id), blocked: true };
  const keepPath = retained.some(file => file.path === keepers.get(group.id))
    ? keepers.get(group.id) : initialKeepers([{ ...group, files: retained }]).get(group.id);
  return { selected: next, keepPath, blocked: false };
}
export function removalPlan(groups, keepers, selected) {
  return groups.map(group => {
    const keep = keepers.get(group.id);
    if (!group.files.some(file => file.path === keep) || selected.has(keep)) throw new Error('invalid-keeper');
    return { group_id: group.id, keep_path: keep, paths: group.files.filter(file => selected.has(file.path)).map(file => file.path) };
  }).filter(group => group.paths.length);
}
export function summary(groups, selected = new Set()) {
  let redundant = 0, selectedBytes = 0, selectedCount = 0;
  for (const group of groups) {
    redundant += group.files[0].size_bytes * (group.files.length - 1);
    for (const file of group.files) if (selected.has(file.path)) { selectedBytes += file.size_bytes; selectedCount++; }
  }
  return { groups: groups.length, redundant, selectedBytes, selectedCount };
}
export function filterGroups(groups, query) {
  const needle = query.trim().toLocaleLowerCase();
  return groups.filter(group => group.files.some(file => file.path.toLocaleLowerCase().includes(needle)));
}
export function applyRemoval(groups, result) {
  const moved = new Set(result.items.filter(item => item.ok).map(item => item.path));
  return groups.map(group => ({ ...group, files: group.files.filter(file => !moved.has(file.path)) })).filter(group => group.files.length > 1);
}
export function cleanupOutcome(result) {
  if (result.uncertain) return 'error';
  if (result.cancelled) return 'stopped';
  const succeeded = result.items.filter(item => item.ok).length;
  const failed = result.items.length - succeeded;
  return failed ? succeeded ? 'partial' : 'failure' : 'success';
}
