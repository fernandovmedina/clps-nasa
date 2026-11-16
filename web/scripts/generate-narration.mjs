#!/usr/bin/env node
/**
 * Graba las líneas fijas del narrador con la misma voz que CAPCOM (Nova 2 Sonic, `carlos`)
 * y las guarda como WAV estáticos en web/public/audio/narration/, más un manifest.json.
 *
 * Uso (desde web/):  node scripts/generate-narration.mjs [--lang es|en] [--voice <voz>] [id ...]
 *   Sin ids graba todas las líneas. `--lang en` (por defecto `es`) graba NARRATION_LINES_EN con una voz inglesa de
 *   Nova 2 Sonic (por defecto `matthew`; cámbiala con `--voice`) en web/public/audio/narration/en/, con su propio
 *   manifest.json y un prompt de locución en inglés. En español la voz sigue siendo la de CAPCOM salvo que pases `--voice`. Usa el mismo acceso de invitado (Cognito) que CAPCOM,
 *   así que deja de funcionar cuando expira CAPCOM_ACCESS_EXPIRES_AT; los WAV ya generados
 *   siguen sirviendo para siempre porque son archivos estáticos.
 *
 * Nova Sonic es voz a voz, no un TTS: se le pide que lea el texto palabra por palabra y se
 * compara su transcripción con el texto pedido. Si no coincide, se reintenta.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CognitoIdentityClient, GetIdCommand, GetOpenIdTokenCommand } from '@aws-sdk/client-cognito-identity';
import { STSClient, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';
import { BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand } from '@aws-sdk/client-bedrock-runtime';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, '..');
const narrationRoot = join(webDir, 'public', 'audio', 'narration');
const LANGS = ['es', 'en'];
const DEFAULT_VOICE = { en: 'matthew' };
const outDirFor = (lang) => (lang === 'en' ? join(narrationRoot, 'en') : narrationRoot);

/** `--lang es|en`, `--voice <voz>` (también `--lang=en`) e ids sueltos. Lanza ante un idioma o una opción desconocidos. */
export function parseArgs(argv) {
  const out = { lang: 'es', voice: null, ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith('--') ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    if (flag === '--lang' || flag === '--voice') {
      const value = inline ?? argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${flag} necesita un valor`);
      if (flag === '--lang') {
        if (!LANGS.includes(value)) throw new Error(`--lang debe ser ${LANGS.join(' o ')}, no «${value}»`);
        out.lang = value;
      } else out.voice = value;
    } else if (arg.startsWith('--')) {
      throw new Error(`opción desconocida: ${arg}`);
    } else out.ids.push(arg);
  }
  return out;
}

/** Lee `export const <name> = { id: 'texto' (+ "texto")*, ... } as const` de narration-lines.ts (comillas simples o dobles). */
export function extractLines(src, name) {
  const block = src.match(new RegExp(`${name}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*as const`));
  if (!block) throw new Error(`No encontré ${name} en lib/engine/narration-lines.ts`);
  const str = `(?:'[^']*'|"[^"]*")`;
  const lines = {};
  // Cada entrada es `id: 'texto' (+ 'texto')*,`
  for (const m of block[1].matchAll(new RegExp(`(\\w+):\\s*((?:${str}\\s*\\+?\\s*)+),`, 'g'))) {
    lines[m[1]] = [...m[2].matchAll(new RegExp(str, 'g'))].map((p) => p[0].slice(1, -1)).join('');
  }
  return lines;
}

const MAX_ATTEMPTS = Number(process.env.NARRATION_ATTEMPTS ?? 4);
const TURN_TIMEOUT_MS = 45_000;
const SILENCE_FRAME = Buffer.alloc(512 * 2).toString('base64'); // 32 ms de silencio a 16 kHz

/** Lee las constantes de los .ts del front para no duplicarlas (son literales simples). */
async function readTsConstants(lang) {
  const config = await readFile(join(webDir, 'lib', 'capcom', 'config.ts'), 'utf8');
  const pick = (name) => {
    const m = config.match(new RegExp(`export const ${name}\\s*=\\s*'([^']+)'`));
    if (!m) throw new Error(`No encontré ${name} en lib/capcom/config.ts`);
    return m[1];
  };
  const rate = config.match(/export const CAPCOM_OUTPUT_SAMPLE_RATE\s*=\s*([\d_]+)/);
  const linesSrc = await readFile(join(webDir, 'lib', 'engine', 'narration-lines.ts'), 'utf8');
  const lines = extractLines(linesSrc, lang === 'en' ? 'NARRATION_LINES_EN' : 'NARRATION_LINES');
  return {
    region: pick('CAPCOM_REGION'),
    modelId: pick('CAPCOM_MODEL_ID'),
    identityPoolId: pick('CAPCOM_IDENTITY_POOL_ID'),
    roleArn: pick('CAPCOM_GUEST_ROLE_ARN'),
    voiceId: pick('CAPCOM_VOICE_ID'),
    sampleRate: Number((rate?.[1] ?? '24000').replace(/_/g, '')),
    lines,
  };
}

async function guestCredentials(cfg) {
  const cognito = new CognitoIdentityClient({ region: cfg.region });
  const { IdentityId } = await cognito.send(new GetIdCommand({ IdentityPoolId: cfg.identityPoolId }));
  const { Token } = await cognito.send(new GetOpenIdTokenCommand({ IdentityId }));
  const sts = new STSClient({ region: cfg.region });
  const { Credentials: c } = await sts.send(new AssumeRoleWithWebIdentityCommand({
    RoleArn: cfg.roleArn,
    RoleSessionName: `narration-${randomUUID().slice(0, 8)}`,
    WebIdentityToken: Token,
    DurationSeconds: 900,
  }));
  return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.SessionToken };
}

const SYSTEM_PROMPTS = {
  es: [
    'Eres CAPCOM, la voz de control de misión de TOUCHDOWN. Hablas en español con voz serena, cercana y profesional, como en una comunicación de radio.',
    'Tu única tarea ahora es locutar: lee en voz alta, palabra por palabra, exactamente el texto que te envíe el usuario.',
    'No respondas al texto, no saludes, no agregues ni quites palabras, no cambies el orden y no digas nada antes ni después.',
  ].join(' '),
  en: [
    "You are CAPCOM, the mission control voice of TOUCHDOWN. You speak English in a calm, warm and professional voice, like a radio call.",
    'Your only task now is to narrate: read aloud, word for word, exactly the text the user sends you.',
    'Do not reply to the text, do not greet, do not add or remove words, do not change the order, and say nothing before or after.',
  ].join(' '),
};

/** El prompt de locución en el idioma de la línea. */
export const systemPromptFor = (lang) => SYSTEM_PROMPTS[lang];

const ev = (event) => ({ chunk: { bytes: new TextEncoder().encode(JSON.stringify({ event })) } });

/** Una sesión por línea: manda el texto como turno de usuario y junta el audio y la transcripción de la respuesta. */
async function recordOnce(client, cfg, text) {
  const promptName = randomUUID();
  const audioName = randomUUID();
  const queue = [];
  let wake = null;
  let done = false;
  const push = (e) => { queue.push(e); wake?.(); };
  const finish = () => { done = true; wake?.(); };

  async function* body() {
    while (true) {
      if (queue.length) { yield queue.shift(); continue; }
      if (done) return;
      await new Promise((r) => { wake = r; });
      wake = null;
    }
  }

  const sysName = randomUUID();
  const userName = randomUUID();
  push(ev({ sessionStart: { inferenceConfiguration: { maxTokens: 300, topP: 0.9, temperature: 0.2 } } }));
  push(ev({ promptStart: {
    promptName,
    textOutputConfiguration: { mediaType: 'text/plain' },
    audioOutputConfiguration: {
      mediaType: 'audio/lpcm', sampleRateHertz: cfg.sampleRate, sampleSizeBits: 16, channelCount: 1,
      voiceId: cfg.voiceId, encoding: 'base64', audioType: 'SPEECH',
    },
  } }));
  push(ev({ contentStart: { promptName, contentName: sysName, type: 'TEXT', interactive: false, role: 'SYSTEM', textInputConfiguration: { mediaType: 'text/plain' } } }));
  push(ev({ textInput: { promptName, contentName: sysName, content: systemPromptFor(cfg.lang) } }));
  push(ev({ contentEnd: { promptName, contentName: sysName } }));
  // Nova Sonic espera un stream de audio abierto aunque el turno sea de texto: se le manda silencio.
  push(ev({ contentStart: { promptName, contentName: audioName, type: 'AUDIO', interactive: true, role: 'USER', audioInputConfiguration: {
    mediaType: 'audio/lpcm', sampleRateHertz: 16000, sampleSizeBits: 16, channelCount: 1, audioType: 'SPEECH', encoding: 'base64',
  } } }));
  push(ev({ contentStart: { promptName, contentName: userName, type: 'TEXT', interactive: true, role: 'USER', textInputConfiguration: { mediaType: 'text/plain' } } }));
  push(ev({ textInput: { promptName, contentName: userName, content: text } }));
  push(ev({ contentEnd: { promptName, contentName: userName } }));

  const silence = setInterval(() => push(ev({ audioInput: { promptName, contentName: audioName, content: SILENCE_FRAME } })), 32);
  let closed = false;
  /** Cierra el audio, el prompt y la sesión en orden; Bedrock marca error si el stream termina con algo abierto. */
  const closeSession = () => {
    if (closed) return;
    closed = true;
    clearInterval(silence);
    push(ev({ contentEnd: { promptName, contentName: audioName } }));
    push(ev({ promptEnd: { promptName } }));
    push(ev({ sessionEnd: {} }));
    finish();
  };
  const timeout = setTimeout(closeSession, TURN_TIMEOUT_MS);

  const chunks = [];
  const blocks = new Map();
  const finals = [];
  const speculative = [];
  let gotAudioEnd = false;
  try {
    const res = await client.send(new InvokeModelWithBidirectionalStreamCommand({ modelId: cfg.modelId, body: body() }));
    for await (const item of res.body) {
      if (!item.chunk?.bytes) {
        const key = Object.keys(item).find((k) => k.endsWith('Exception'));
        if (key) throw new Error(`${key}: ${item[key]?.message ?? ''}`);
        continue;
      }
      const { event } = JSON.parse(new TextDecoder().decode(item.chunk.bytes));
      if (process.env.NARRATION_DEBUG) { const k = Object.keys(event)[0]; const f = event[k]; if (k !== 'audioOutput') console.log('   ·', k, f.type ?? '', f.role ?? '', f.additionalModelFields ?? '', f.stopReason ?? '', typeof f.content === 'string' ? f.content.slice(0, 80) : ''); }
      if (event.contentStart) {
        let stage = 'final';
        try { stage = JSON.parse(event.contentStart.additionalModelFields ?? '{}').generationStage === 'SPECULATIVE' ? 'speculative' : 'final'; } catch { /* sin campos extra */ }
        blocks.set(event.contentStart.contentId, { type: event.contentStart.type, role: event.contentStart.role, stage, text: '' });
      } else if (event.textOutput) {
        const b = blocks.get(event.textOutput.contentId);
        if (b) b.text += event.textOutput.content ?? '';
      } else if (event.audioOutput?.content) {
        chunks.push(Buffer.from(event.audioOutput.content, 'base64'));
      } else if (event.contentEnd) {
        const b = blocks.get(event.contentEnd.contentId);
        if (b?.type === 'TEXT' && b.role === 'ASSISTANT') (b.stage === 'final' ? finals : speculative).push(b.text.trim());
        if (b?.type === 'AUDIO' && chunks.length) gotAudioEnd = true;
        // La transcripción FINAL llega después del audio: con ella el turno está completo.
        if (gotAudioEnd && b?.type === 'TEXT' && b.role === 'ASSISTANT' && b.stage === 'final') closeSession();
      } else if (event.completionEnd && gotAudioEnd) {
        closeSession();
      }
    }
  } finally {
    clearInterval(silence);
    clearTimeout(timeout);
    finish();
  }
  if (!gotAudioEnd) throw new Error('la sesión terminó sin audio completo');
  // La transcripción especulativa es lo que el modelo genera para locutar; la final la confirma, pero si
  // locuta en varios tramos solo llega la del primero: entonces vale la especulativa, que los trae todos.
  return { pcm: Buffer.concat(chunks), transcript: (finals.length >= speculative.length ? finals : speculative).join(' ') };
}

export const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Recorta silencio al inicio y al final (deja 60 ms de aire) para que el audio entre a tiempo con la escena. */
function trimSilence(pcm, sampleRate) {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1);
  const threshold = 300;
  let start = 0, end = samples.length;
  while (start < end && Math.abs(samples[start]) < threshold) start++;
  while (end > start && Math.abs(samples[end - 1]) < threshold) end--;
  const pad = Math.round(sampleRate * 0.06);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length, end + pad);
  return Buffer.from(samples.slice(start, end).buffer);
}

function wav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = await readTsConstants(args.lang);
  cfg.lang = args.lang;
  cfg.voiceId = args.voice ?? DEFAULT_VOICE[args.lang] ?? cfg.voiceId;
  const outDir = outDirFor(args.lang);
  const wanted = args.ids;
  const ids = wanted.length ? wanted : Object.keys(cfg.lines);
  for (const id of ids) if (!cfg.lines[id]) throw new Error(`id desconocido: ${id}`);

  await mkdir(outDir, { recursive: true });
  const manifestPath = join(outDir, 'manifest.json');
  let manifest = { voiceId: cfg.voiceId, modelId: cfg.modelId, clips: {} };
  try { manifest = { ...JSON.parse(await readFile(manifestPath, 'utf8')), voiceId: cfg.voiceId, modelId: cfg.modelId }; } catch { /* primera vez */ }

  const client = new BedrockRuntimeClient({ region: cfg.region, credentials: await guestCredentials(cfg), maxAttempts: 1 });
  let failed = 0;
  for (const id of ids) {
    const text = cfg.lines[id];
    let ok = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
      try {
        const { pcm, transcript } = await recordOnce(client, cfg, text);
        if (normalize(transcript) !== normalize(text)) {
          console.warn(`  ✗ ${id} (intento ${attempt}): dijo «${transcript}»`);
          continue;
        }
        const trimmed = trimSilence(pcm, cfg.sampleRate);
        const file = `${id}.wav`;
        await writeFile(join(outDir, file), wav(trimmed, cfg.sampleRate));
        const durationMs = Math.round((trimmed.length / 2 / cfg.sampleRate) * 1000);
        manifest.clips[id] = { file, text, durationMs };
        console.log(`  ✓ ${id}: ${durationMs} ms`);
        ok = true;
      } catch (error) {
        console.warn(`  ✗ ${id} (intento ${attempt}): ${error.message}`);
      }
    }
    if (!ok) failed++;
  }
  client.destroy();
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (failed) {
    console.error(`${failed} línea(s) sin audio: el narrador usará la voz del navegador para ellas.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
