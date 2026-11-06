function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let l = 1; l <= left.length; l += 1) {
    let diagonal = row[0];
    row[0] = l;
    for (let r = 1; r <= right.length; r += 1) {
      const previous = row[r];
      row[r] = Math.min(
        row[r] + 1,
        row[r - 1] + 1,
        diagonal + (left[l - 1] === right[r - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[right.length];
}

export function closestTitleCorrection(query: string, titles: string[]) {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 4) return "";
  const queryWords = normalizedQuery.split(" ");
  let best = { title: "", distance: Number.POSITIVE_INFINITY };
  for (const title of titles) {
    const normalizedTitle = normalizeSearchText(title);
    if (!normalizedTitle || normalizedTitle === normalizedQuery) continue;
    const titleWords = normalizedTitle.split(" ");
    if (titleWords.length !== queryWords.length) continue;
    const distances = queryWords.map((word, index) =>
      editDistance(word, titleWords[index]),
    );
    if (
      distances.some(
        (distance, index) =>
          distance /
            Math.max(queryWords[index].length, titleWords[index].length) >
          0.34,
      )
    )
      continue;
    const distance = editDistance(normalizedQuery, normalizedTitle);
    if (
      distance > Math.max(1, Math.floor(normalizedQuery.length * 0.16)) ||
      distance >= best.distance
    )
      continue;
    best = { title, distance };
  }
  return best.title;
}
