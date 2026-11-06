function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const optionalTitleWords = new Set(["a", "an", "and", "of", "the", "to"]);

export function correctionSearchProbes(query: string) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const words = normalized
    .split(" ")
    .filter((word) => word.length >= 4)
    .sort((left, right) => right.length - left.length);
  const probes: string[] = [];
  for (const word of words) {
    if (word !== normalized) probes.push(word);
    if (word.length >= 6)
      probes.push(word.slice(0, Math.max(4, Math.ceil(word.length * 0.55))));
  }
  return [...new Set(probes)].slice(0, 4);
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
    let comparedQueryWords = queryWords;
    let comparedTitleWords = normalizedTitle.split(" ");
    if (comparedTitleWords.length !== comparedQueryWords.length) {
      if (queryWords.length < 2) continue;
      comparedQueryWords = queryWords.filter(
        (word) => !optionalTitleWords.has(word),
      );
      comparedTitleWords = comparedTitleWords.filter(
        (word) => !optionalTitleWords.has(word),
      );
    }
    if (comparedTitleWords.length !== comparedQueryWords.length) continue;
    const distances = comparedQueryWords.map((word, index) =>
      editDistance(word, comparedTitleWords[index]),
    );
    if (
      distances.some(
        (distance, index) =>
          distance /
            Math.max(
              comparedQueryWords[index].length,
              comparedTitleWords[index].length,
            ) >
          0.34,
      )
    )
      continue;
    const comparedQuery = comparedQueryWords.join(" ");
    const comparedTitle = comparedTitleWords.join(" ");
    const distance = editDistance(comparedQuery, comparedTitle);
    const maximumDistance =
      comparedQueryWords.length === 1 && comparedQuery.length < 8
        ? 1
        : Math.max(1, Math.ceil(comparedQuery.length * 0.2));
    if (
      distance > maximumDistance ||
      distance >= best.distance
    )
      continue;
    best = { title, distance };
  }
  return best.title;
}
