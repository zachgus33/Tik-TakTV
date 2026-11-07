export function hasProductionAppRoot(html) {
  return /<div\b[^>]*\bid=(["'])root\1[^>]*>[\s\S]*?<\/div>/i.test(html);
}
