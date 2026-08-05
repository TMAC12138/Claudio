export async function attachPlayableSongs(
  result,
  source,
  { ncm, db, logger },
  { record = true } = {},
) {
  try {
    const playable = await ncm.resolvePlayableSongs(result.play || [], 11);
    result.play = playable;
    if (record && playable.length) db.recordPlay(playable[0], source);
  } catch (error) {
    logger.warn('Music URL resolve error:', error.message);
    result.play = [];
  }
  return result;
}
