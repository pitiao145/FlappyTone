#!/bin/sh
# Synthesises TonyStory's sound effects with ffmpeg (no samples, no licences).
# Usage: sh video/make-sfx.sh  → video/public/sfx/*.wav
set -e
O=video/public/sfx; mkdir -p $O
g() { ffmpeg -loglevel error -y -f lavfi -i "$2" -t "$3" -ar 44100 -ac 1 "$O/$1.wav"; }
g pop      "aevalsrc='0.6*sin(2*PI*(300+2600*t)*t)*exp(-30*t)'" 0.18
g ding     "aevalsrc='0.4*(sin(2*PI*1320*t)+0.5*sin(2*PI*2640*t))*exp(-5*t)'" 0.9
g boing    "aevalsrc='0.5*sin(2*PI*(180+70*sin(2*PI*14*t))*t)*exp(-3*t)'" 0.8
g wahwah   "aevalsrc='0.35*sin(2*PI*(if(lt(t,0.35),392,if(lt(t,0.7),370,if(lt(t,1.05),349,330-20*sin(2*PI*6*t)))))*t)*(1-exp(-40*t))*if(gt(t,1.05),exp(-1.6*(t-1.05)),1)'" 1.9
g sparkle  "aevalsrc='0.3*sin(2*PI*(if(lt(t,0.08),1047,if(lt(t,0.16),1319,if(lt(t,0.24),1568,2093))))*t)*exp(-3*(t-floor(t/0.08)*0.08))*exp(-1.5*t)'" 0.9
g tada     "aevalsrc='0.3*(sin(2*PI*523*t)*lt(t,0.12)+sin(2*PI*659*t)*between(t,0.12,0.24)+sin(2*PI*784*t)*between(t,0.24,0.36)+(sin(2*PI*1047*t)+0.6*sin(2*PI*784*t)+0.5*sin(2*PI*659*t))*gt(t,0.36)*exp(-2*(t-0.36)))'" 1.6
g thud     "aevalsrc='0.8*sin(2*PI*(90-50*t)*t)*exp(-14*t)'" 0.35
ffmpeg -loglevel error -y -f lavfi -i "anoisesrc=color=pink:amplitude=0.6:d=0.6" -af "highpass=f=500,lowpass=f=4000,afade=t=in:d=0.25,afade=t=out:st=0.3:d=0.3" -ar 44100 $O/whoosh.wav
ffmpeg -loglevel error -y -f lavfi -i "anoisesrc=color=brown:amplitude=0.5:d=3" -af "lowpass=f=600,afade=t=in:d=0.6,afade=t=out:st=2:d=1" -ar 44100 $O/plane.wav
ffmpeg -loglevel error -y -f lavfi -i "anoisesrc=color=brown:amplitude=0.8:d=2.4" -af "lowpass=f=300,volume='0.15+0.85*pow(sin(PI*t/1.2),4)':eval=frame" -ar 44100 $O/snore.wav
ffmpeg -loglevel error -y -f lavfi -i "anoisesrc=color=white:amplitude=0.5:d=0.4" -af "bandpass=f=2500:w=2000,afade=t=out:d=0.4" -ar 44100 $O/puff.wav
