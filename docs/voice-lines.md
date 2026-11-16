# Voice lines to record

This sheet is generated from `src/js/00-config.js` by `npm run voice-script`. Do not edit it by hand; change the text in the config file and run the command again.

## How it works

- Record each line **clean and dry**: no radio effect, no reverb, no music. The game adds the bad-radio sound itself (narrow band, overdrive, static, dropouts), so every line matches and the effect can be retuned later without recording again.
- Save each line as its own file, named exactly as in the "File" column, and put it in `assets/voice/`.
- `.mp3` is best (small). `.wav`, `.ogg` and `.m4a` also work. Mono is enough.
- Trim the silence at the start and end to about a tenth of a second.
- Run `npm run build`. The build reports how many recordings it packed into the page.
- Any line without a file simply stays text only, so you can add them one at a time.

To retune the effect, see `VOICE_TREATMENTS` in `src/js/07-audio.js`.

## Voice 1: Dispatch (required for voiced radio)

A night-shift controller at the surface, talking to you over a poor radio link. Middle-aged, tired, unhurried, procedural. He has sent crews down before. He never sounds alarmed, which is what makes the later lines uneasy. Keep the same voice and distance from the microphone for all nine lines.

| File | Line | How to say it |
|---|---|---|
| `leftLift.mp3` | The car goes back up on its own when it is empty. Mains is dead on your level. Find Generator 2 and get it running. It is off Pump Hall B. | Routine. Reading a checklist for the hundredth time. |
| `firstSpool.mp3` | That is one. Crew 2 logged two more: one in the calibration store, one at the shaft. | Flat, mildly pleased. Already looking at the next item. Only in stations with exactly three spools. |
| `firstSpoolOfMany.mp3` | That is one. Crew 2 logged more of them. One is in the calibration store, one is at the shaft, and the rest are wherever they left them. | The same, a little wearier: the list is longer than he would like. Only in stations with more than three spools. |
| `generatorStarted.mp3` | We see the load up here. Powered doors should answer now. | Matter-of-fact, eyes on a gauge. |
| `generatorFollowUp.mp3` | Odd. The motion sensor in the shaft chamber just tripped. Probably the mains coming back. | Mild curiosity on "Odd." Then talks himself out of it. Not worried. |
| `keycardTaken.mp3` | That card opens the keycard doors. Shaft 9 is behind one of them. | Helpful, brief. |
| `lowerKeycardTaken.mp3` | That card opens some of the doors. Not the way to Shaft 9. There is another card further in. | Helpful, brief, a little apologetic. Only heard in large stations, which have more than one card. |
| `secondSpool.mp3` | That is two. Do not stay in that room. | First sentence normal. Second sentence a little too quick. Said when the Stills of the calibration store wake, in stations with exactly three spools. |
| `stillsWake.mp3` | Do not stay in that room. | A little too quick, as if he has seen something on his board. Said when the Stills of the calibration store wake, in stations with more than three spools. |
| `generatorNoFuel.mp3` | Day tank reads empty from here. There will be a fuel can somewhere on your level. Bring it to the generator. | Reading it off a screen. Mildly annoyed at the station, not at you. Said the first time any generator will not start for want of fuel. |
| `generatorsWanted.mp3` | One set will not lift the car. There are more generators on your level, and the winch wants every one of them running before you call the lift. We have marked them for you. They are not quiet. | Starts as a routine correction. Slows down on the last sentence: he knows what noise means down there. Only in stations with more generators, a little after Generator 2 starts. |
| `badgesWanted.mp3` | Personnel wants the badges of Crew 2 back. They will be with whatever the crew left lying about. Bring every one you find. The terminal will count them. | Passing on a request he did not want to pass on. Flat. A short pause before "Bring every one you find." Only in stations with the badges quest. |
| `valvesWanted.mp3` | One more for the list. The isolation valves on your level have to be shut before we bring you up. I have marked them. Those actuators have not turned in years. They will complain. | Checklist voice. The last two sentences are almost an apology. Only in stations with the valves quest, a little after you take a keycard. |
| `coresWanted.mp3` | One more thing while you are down there. The lab wants the core samples Crew 2 pulled. Grey tubes. Bring them all. | An afterthought, as if someone has just handed him a note. Only in stations with the core sample job. |
| `winchBreakerOpen.mp3` | Upload received. But the car is not answering. The winch breaker has tripped. I have marked the panel on your map. Close it. | The first two sentences flat. Then a beat. Then quicker: he knows what this means for you. Only with the breaker job. |
| `breakerClosed.mp3` | Breaker is in. The car is on its way down. Forty seconds. Get back to the lobby. | Fast and low. The last sentence is an order. Only with the breaker job. |
| `doorBroken.mp3` | I just lost a door on the board. Those are rated for the whole shaft coming down. Do not count on the ones you have left. | Shaken, and trying not to sound it. The second sentence is disbelief. The last is advice, quietly. Heard the first time it breaks a door down. |
| `allSpools.mp3` | That is all of them. Go back to the lift lobby and upload them. | Relief he is trying not to show. (The recording made before this text changed says "all three".) |
| `uploadStarted.mp3` | Upload received. The car is on its way down. Forty seconds. It is not a quiet machine. | Businesslike. The last sentence is a dry understatement. |
| `liftArrived.mp3` | The car is at your level. Get in quick. | Urgent now, but still quiet. He does not raise his voice. |

## Voice 2: A. Ripley, survey lead of Crew 2 (optional)

The three survey spools are her dictated field notes. With a recording, a spool is read aloud while its text is open, through a softer "dictation machine" effect. A different voice from Dispatch: a professional in her thirties or forties, exact with words. Each spool is one file; leave a short pause between paragraphs.

### `spool1.mp3`: Survey spool 1 of 3

*Day 1. Calm and precise, a surveyor dictating notes. Slightly amused at the end, not yet afraid.*

> Fixtures are dead on every level, so we scan dark, as usual.
>
> Tomas ran the main corridor twice. The first pass has a cluster by the east door: upright, about 1.9 m tall, a few hundred returns. The second pass does not have it.
>
> We logged it as a moving-object artefact. That label is meant for people who walk through a scan. There are three of us, and all three were standing behind the tripod.

### `spool2.mp3`: Survey spool 2 of 3

*Day 3. Quieter, closer to the microphone. The last two sentences are said with no emotion at all.*

> They only move when nothing is scanning them.
>
> I walked backwards to the door with the beam on wide, sweeping across every one of them, and they stayed where they were.
>
> Tomas turned his scanner off to save the battery. I found his scanner.

### `spool3.mp3`: Survey spool 3 of 3

*Day 4. Exhausted and very controlled. Speaking to whoever comes next.*

> We aimed the tripod down Shaft 9 to close out the job. Returns stop at forty metres. It is not a floor. Past that depth the pulses go out and do not come back.
>
> On the last pass something at the bottom of the range was standing on the shaft wall, looking up the beam.
>
> I am leaving the spools where the next crew will find them. If that is you: it came up because we showed it the way. Do not call the lift until you are ready to leave. The lift is very loud.

## Not voiced

The four notes (security shift note, locker note, bench notes, inventory query) are paper, written by other people, and stay text only.
