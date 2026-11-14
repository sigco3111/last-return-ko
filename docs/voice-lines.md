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
| `firstSpool.mp3` | That is one. Crew 2 logged two more: one in the calibration store, one at the shaft. | Flat, mildly pleased. Already looking at the next item. |
| `generatorStarted.mp3` | We see the load up here. Powered doors should answer now. | Matter-of-fact, eyes on a gauge. |
| `generatorFollowUp.mp3` | Odd. The motion sensor in the shaft chamber just tripped. Probably the mains coming back. | Mild curiosity on "Odd." Then talks himself out of it. Not worried. |
| `keycardTaken.mp3` | That card opens the keycard doors. Shaft 9 is behind one of them. | Helpful, brief. |
| `secondSpool.mp3` | That is two. Do not stay in that room. | First sentence normal. Second sentence a little too quick. |
| `allSpools.mp3` | That is all three. Go back to the lift lobby and upload them. | Relief he is trying not to show. |
| `uploadStarted.mp3` | Upload received. The car is on its way down. Forty seconds. It is not a quiet machine. | Businesslike. The last sentence is a dry understatement. |
| `liftArrived.mp3` | The car is at your level. Get in quick. | Urgent now, but still quiet. He does not raise his voice. |

## Voice 2: I. Okafor, survey lead of Crew 2 (optional)

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
