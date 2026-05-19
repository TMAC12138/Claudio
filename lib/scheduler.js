import cron from 'node-cron';
import * as db from './db.js';
import * as context from './context.js';
import * as claude from './claude.js';
import * as tts from './tts.js';
import * as ncm from './ncm.js';

let wsBroadcast = null;
const jobs = [];

export function setBroadcast(fn) {
  wsBroadcast = fn;
}

async function triggerBroadcast(slot, input) {
  console.log(`[scheduler] Triggering ${slot} broadcast`);

  const prompt = await context.assemble({
    input,
    db,
    trigger: { source: 'scheduler', slot },
  });

  const result = await claude.ask(prompt);
  try {
    result.play = await ncm.resolvePlayableSongs(result.play || [], 3);
  } catch (err) {
    console.warn('[scheduler] Music URL resolve error:', err.message);
    result.play = [];
  }

  // TTS synthesis
  if (result.say) {
    const ttsResult = await tts.synthesize(result.say);
    result.ttsUrl = ttsResult.url;
  }

  // Save to plan table
  db.savePlan(slot, result.play || [], result.reason || '');

  // Broadcast via WebSocket
  if (wsBroadcast) {
    wsBroadcast({
      type: 'auto-broadcast',
      slot,
      ...result,
    });
  }

  return result;
}

export function start() {
  // Morning: 07:00
  jobs.push(cron.schedule('0 7 * * *', () => {
    triggerBroadcast('morning', '早上好！今天天气怎么样？推荐一些适合早晨的音乐，帮我开启美好的一天。');
  }, { timezone: 'Asia/Shanghai' }));

  // Noon: 12:00
  jobs.push(cron.schedule('0 12 * * *', () => {
    triggerBroadcast('noon', '中午了，推荐一些轻松的午餐音乐。');
  }, { timezone: 'Asia/Shanghai' }));

  // Evening: 19:00
  jobs.push(cron.schedule('0 19 * * *', () => {
    triggerBroadcast('evening', '晚上好，推荐一些放松的音乐，帮我从忙碌中切换出来。');
  }, { timezone: 'Asia/Shanghai' }));

  console.log('[scheduler] Started: morning(07:00), noon(12:00), evening(19:00)');
}

export function stop() {
  jobs.forEach(j => j.stop());
  jobs.length = 0;
  console.log('[scheduler] Stopped');
}

export function getStatus() {
  return {
    running: jobs.length > 0,
    jobs: jobs.length,
    slots: ['morning', 'noon', 'evening'],
  };
}
