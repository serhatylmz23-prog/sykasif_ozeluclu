interface SpeechToken {
  token: string;
  region: string;
  voice: string;
  expiresInSeconds: number;
}

let cachedToken: (SpeechToken & { expiresAt: number }) | null = null;

async function getSpeechToken(): Promise<SpeechToken> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken;
  }
  const response = await fetch('/api/speech/token', { method: 'POST' });
  const data = (await response.json().catch(() => null)) as
    | (SpeechToken & { error?: string })
    | null;
  if (!response.ok || !data?.token) {
    throw new Error(data?.error || 'Azure Speech tokenı alınamadı.');
  }
  cachedToken = {
    ...data,
    expiresAt: Date.now() + data.expiresInSeconds * 1_000,
  };
  return data;
}

async function recognizeAzureOnce(): Promise<string> {
  const token = await getSpeechToken();
  // The SDK is an optional runtime dependency; keep the browser fallback working
  // even when its type declarations are not installed.
  const SpeechSDK = (await import(
    'microsoft-cognitiveservices-speech-sdk'
  )) as any;
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
    token.token,
    token.region
  );
  speechConfig.speechRecognitionLanguage = 'tr-TR';
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result: any) => {
        recognizer.close();
        if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const text = result.text.trim();
          if (text) resolve(text);
          else reject(new Error('Konuşma algılanamadı.'));
          return;
        }
        if (result.reason === SpeechSDK.ResultReason.NoMatch) {
          reject(new Error('Konuşma anlaşılamadı; lütfen tekrar deneyin.'));
          return;
        }
        reject(new Error(result.errorDetails || 'Azure konuşma tanıma başarısız.'));
      },
      (error: unknown) => {
        recognizer.close();
        reject(new Error(String(error)));
      }
    );
  });
}

export async function recognizeTurkishOnce(): Promise<string> {
  try {
    return await recognizeAzureOnce();
  } catch (error) {
    console.warn('Azure STT kullanılamadı; tarayıcı STT deneniyor:', error);
    return recognizeWithBrowser();
  }
}

function recognizeWithBrowser(): Promise<string> {
  const SpeechRecognition =
    (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => any })
      .webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return Promise.reject(
      new Error('Azure Speech yapılandırılmadı ve tarayıcı STT desteklemiyor.')
    );
  }

  return new Promise((resolve, reject) => {
    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const text = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (text) resolve(text);
      else reject(new Error('Konuşma algılanamadı.'));
    };
    recognition.onerror = (event: any) =>
      reject(new Error(`Mikrofon hatası: ${event.error || 'bilinmiyor'}`));
    recognition.start();
  });
}

export async function speakTurkishFemale(text: string): Promise<'azure' | 'browser'> {
  try {
    const token = await getSpeechToken();
    const SpeechSDK = await import('microsoft-cognitiveservices-speech-sdk');
    const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
      token.token,
      token.region
    );
    speechConfig.speechSynthesisLanguage = 'tr-TR';
    speechConfig.speechSynthesisVoiceName = token.voice || 'tr-TR-EmelNeural';
    const audioConfig = SpeechSDK.AudioConfig.fromDefaultSpeakerOutput();
    const synthesizer = new SpeechSDK.SpeechSynthesizer(
      speechConfig,
      audioConfig
    );

    await new Promise<void>((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result: any) => {
          synthesizer.close();
          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            resolve();
          } else {
            reject(new Error(result.errorDetails || 'Azure ses üretimi başarısız.'));
          }
        },
        (error: unknown) => {
          synthesizer.close();
          reject(new Error(String(error)));
        }
      );
    });
    return 'azure';
  } catch (error) {
    console.warn('Azure Speech kullanılamadı; tarayıcı sesi deneniyor:', error);
    await speakWithBrowser(text);
    return 'browser';
  }
}

function browserVoices(): Promise<SpeechSynthesisVoice[]> {
  const current = window.speechSynthesis.getVoices();
  if (current.length > 0) return Promise.resolve(current);
  return new Promise((resolve) => {
    const timeout = window.setTimeout(
      () => resolve(window.speechSynthesis.getVoices()),
      1_000
    );
    window.speechSynthesis.addEventListener(
      'voiceschanged',
      () => {
        window.clearTimeout(timeout);
        resolve(window.speechSynthesis.getVoices());
      },
      { once: true }
    );
  });
}

/**
 * DÜZELTME: Önceki sürümde bu fonksiyonun içinde "preferred" değişkeni
 * hiç TANIMLANMADAN kullanılıyordu (derleme sırasında hata vermesi
 * gerekirdi). Aşağıda hem `preferred` doğru şekilde bulunuyor hem de
 * hiçbir Türkçe kadın ses bulunamazsa bunu SESSİZCE varsayılan (genelde
 * erkek) sese düşmek yerine en azından konsola not düşüyoruz — böylece
 * "neden erkek ses duyuyorum" sorusu kolayca teşhis edilebilir.
 */
async function speakWithBrowser(text: string): Promise<void> {
  if (!('speechSynthesis' in window)) {
    throw new Error('Bu tarayıcı ses sentezini desteklemiyor.');
  }
  window.speechSynthesis.cancel();
  const voices = await browserVoices();
  const turkishVoices = voices.filter((voice) =>
    voice.lang.toLocaleLowerCase('tr-TR').startsWith('tr')
  );
  const preferred = turkishVoices.find((voice) =>
    /(emel|seda|female|kadın|yelda|filiz)/i.test(voice.name)
  );

  if (!preferred) {
    console.warn(
      'Bu cihazda Türkçe bir kadın tarayıcı sesi bulunamadı; sistemin varsayılan Türkçe sesi kullanılacak (cihaza göre erkek ses olabilir). Kalıcı çözüm için Azure Speech yapılandırmasının (.env içindeki AZURE_SPEECH_KEY / AZURE_SPEECH_REGION) doğru olduğundan emin olun; Azure her zaman "tr-TR-EmelNeural" kadın sesini kullanır.'
    );
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.voice = preferred || turkishVoices[0] || null;
    utterance.pitch = 1.03;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error('Tarayıcı sesi oynatılamadı.'));
    window.speechSynthesis.speak(utterance);
  });
}