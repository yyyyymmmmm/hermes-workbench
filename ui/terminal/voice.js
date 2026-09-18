window.HermesVoice = (() => {
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let recognition,active=false,speaking=false,continuous=false,onText=()=>{},onStatus=()=>{},timer,generation=0,utteranceVersion=0;
  const status=text=>onStatus(text);
  const voices=()=>window.speechSynthesis?.getVoices()||[];
  function stop(){active=false;generation++;utteranceVersion++;clearTimeout(timer);recognition?.abort();recognition=null;window.speechSynthesis?.cancel();speaking=false;status('语音已停止');}
  function speak(text,settings={},finished=()=>{}){
    if(!window.speechSynthesis||!voices().length){status('当前系统没有可用的朗读语音');finished();return false;}
    const version=++utteranceVersion;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='zh-CN';u.rate=Number(settings.rate)||1;
    u.voice=voices().find(v=>v.voiceURI===settings.voice)||voices().find(v=>v.lang.startsWith('zh'))||voices()[0];
    speaking=true;u.onend=()=>{if(version!==utteranceVersion)return;speaking=false;status(active?'继续聆听…':'朗读完成');finished();};u.onerror=()=>{if(version!==utteranceVersion)return;speaking=false;status('朗读不可用，请检查系统语音');finished();};window.speechSynthesis.speak(u);return true;
  }
  function listen(){
    if(!active||speaking)return;
    const session=generation;
    recognition=new Recognition();recognition.lang='zh-CN';recognition.continuous=false;recognition.interimResults=true;let finalText='';
    recognition.onstart=()=>{if(session===generation)status(continuous?'连续对话 · 正在聆听':'正在聆听…');};
    recognition.onresult=e=>{if(session!==generation)return;let interim='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)finalText+=e.results[i][0].transcript;else interim+=e.results[i][0].transcript;}if(interim)status(interim);};
    recognition.onerror=e=>{if(session!==generation)return;active=false;clearTimeout(timer);status(({ 'not-allowed':'麦克风权限未允许','audio-capture':'未检测到可用麦克风','network':'浏览器语音识别服务连接失败','no-speech':'没有听到语音，请重试' })[e.error]||'语音识别不可用，请重试');};
    recognition.onend=()=>{
      if(!active||session!==generation)return;
      if(finalText.trim())onText(finalText.trim());
      if(!continuous){active=false;status('已转为文字');return;}
      const reply='已记录你的话。当前为本地对话预览，尚未连接 Hermes。';
      const resume=()=>{if(active)timer=setTimeout(listen,350);};
      if(finalText.trim())speak(reply,HermesStore.data.agent?.voice,resume);else timer=setTimeout(listen,700);
    };
    try{recognition.start();}catch{active=false;status('无法启动语音识别');}
  }
  function start(options={}){stop();if(!Recognition){status('当前浏览器不支持语音识别');return false;}continuous=!!options.continuous;active=true;listen();return true;}
  return {voices,stop,start,speak,recognitionAvailable:!!Recognition,ttsAvailable:!!window.speechSynthesis,get active(){return active;},bind(text,statusCallback){onText=text;onStatus=statusCallback;}};
})();
