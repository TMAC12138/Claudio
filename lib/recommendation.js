export async function attachPlayableSongs(
  result,
  source,
  { ncm, db, logger },
  { record = true, throwOnError = false } = {},
) {
  try {
    const playable = await ncm.resolvePlayableSongs(result.play || [], 11, { logger, source });
    result.play = playable;
    if (record && playable.length) db.recordPlay(playable[0], source);
  } catch (error) {
    if (error.code !== 'NCM_RATE_LIMITED') {
      logger.warn({
        event: 'music_url_resolve_failed',
        errorCode: error.code || 'NCM_RESOLVE_FAILED',
        source,
        errorMessage: error.message,
      }, 'Music URL resolution failed');
    }
    result.play = [];
    if (throwOnError) throw error;
  }
  return result;
}

export function getQueueRefreshErrorResponse(error) {
  if (error?.code === 'NCM_RATE_LIMITED') {
    return {
      status: 429,
      body: { error: '网易云请求过于频繁，请稍后再试' },
    };
  }
  return {
    status: 502,
    body: { error: '没有可播放的推荐歌曲' },
  };
}
