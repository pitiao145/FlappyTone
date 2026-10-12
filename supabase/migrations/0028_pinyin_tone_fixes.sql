-- 0028: data-only. Align words.pinyin/tone/tones with TOCFL 8000 (MOE base tones)
-- and Jane's full-tone re-records. Brief: docs/briefs/01-pinyin-tone-fixes.md.
-- Ids unchanged; word_clips/polyline/contour untouched. No schema change.


-- A. 一 -> yī (TOCFL base tone)
update public.words set pinyin = 'yī xià', tone = 1, tones = '{1,4}', updated_at = now() where id = 'yixia24';
update public.words set pinyin = 'yī gòng', tone = 1, tones = '{1,4}', updated_at = now() where id = 'yigong24';
update public.words set pinyin = 'yī zhí', tone = 1, tones = '{1,2}', updated_at = now() where id = 'yizhi42';
update public.words set pinyin = 'yī bān', tone = 1, tones = '{1,1}', updated_at = now() where id = 'yiban41';
update public.words set pinyin = 'yī biān', tone = 1, tones = '{1,1}', updated_at = now() where id = 'yibian41';

-- B. 不 -> bù (TOCFL base tone)
update public.words set pinyin = 'bù dàn', tone = 4, tones = '{4,4}', updated_at = now() where id = 'budan24';
update public.words set pinyin = 'bù yòng', tone = 4, tones = '{4,4}', updated_at = now() where id = 'buyong24';
update public.words set pinyin = 'bù yào', tone = 4, tones = '{4,4}', updated_at = now() where id = 'buyao24';
update public.words set pinyin = 'bù jiàn', tone = 4, tones = '{4,4}', updated_at = now() where id = 'bujian24';
update public.words set pinyin = 'duì bù qǐ', tone = 4, tones = '{4,4,3}', updated_at = now() where id = 'duibuqi403';
update public.words set pinyin = 'chà bù duō', tone = 4, tones = '{4,4,1}', updated_at = now() where id = 'chabuduo401';

-- C. Jane's full-tone re-records 
update public.words set pinyin = 'zǎo shàng', tone = 3, tones = '{3,4}', updated_at = now() where id = 'zaoshang30';
update public.words set pinyin = 'wǎn shàng', tone = 3, tones = '{3,4}', updated_at = now() where id = 'wanshang30';
update public.words set pinyin = 'pián yí', tone = 2, tones = '{2,2}', updated_at = now() where id = 'pianyi20';
update public.words set pinyin = 'rèn shì', tone = 4, tones = '{4,4}', updated_at = now() where id = 'renshi40';
update public.words set pinyin = 'zhàng fū', tone = 4, tones = '{4,1}', updated_at = now() where id = 'zhangfu40';
update public.words set pinyin = 'yī fú', tone = 1, tones = '{1,2}', updated_at = now() where id = 'yifu10';
-- 和: written stays TOCFL hé (tone 2); the label shows both readings because
-- Jane's natural take is the spoken Taiwan reading hàn (word_clips.spoken_tones, 0029).
update public.words set pinyin = 'hé/hàn', updated_at = now() where id = 'he2';

-- D. TOCFL full tone, no clips yet
update public.words set pinyin = 'ài rén', tone = 4, tones = '{4,2}', updated_at = now() where id = 'airen40';
update public.words set pinyin = 'dà rén', tone = 4, tones = '{4,2}', updated_at = now() where id = 'daren40';
update public.words set pinyin = 'gào sù', tone = 4, tones = '{4,4}', updated_at = now() where id = 'gaosu40';
update public.words set pinyin = 'liáng kuài', tone = 2, tones = '{2,4}', updated_at = now() where id = 'liangkuai20';
update public.words set pinyin = 'míng bái', tone = 2, tones = '{2,2}', updated_at = now() where id = 'mingbai20';
update public.words set pinyin = 'qīng chǔ', tone = 1, tones = '{1,3}', updated_at = now() where id = 'qingchu10';
update public.words set pinyin = 'shì qíng', tone = 4, tones = '{4,2}', updated_at = now() where id = 'shiqing40';
update public.words set pinyin = 'wài biān', tone = 4, tones = '{4,1}', updated_at = now() where id = 'waibian40';
update public.words set pinyin = 'xíng lǐ', tone = 2, tones = '{2,3}', updated_at = now() where id = 'xingli20';
update public.words set pinyin = 'yuè liàng', tone = 4, tones = '{4,4}', updated_at = now() where id = 'yueliang40';
update public.words set pinyin = 'qī zǐ', tone = 1, tones = '{1,3}', updated_at = now() where id = 'qizi10';

-- E. TOCFL tone fixes
update public.words set pinyin = 'chéng jī', tone = 2, tones = '{2,1}', updated_at = now() where id = 'chengji24';
update public.words set pinyin = 'tú rán', tone = 2, tones = '{2,2}', updated_at = now() where id = 'turan12';
update public.words set pinyin = 'zhāo jí', tone = 1, tones = '{1,2}', updated_at = now() where id = 'zhaoji22';
update public.words set pinyin = 'shú shu', tone = 2, tones = '{2,0}', updated_at = now() where id = 'shushu10';
update public.words set pinyin = 'jià qí', tone = 4, tones = '{4,2}', updated_at = now() where id = 'jiaqi41';
update public.words set pinyin = 'xué qí', tone = 2, tones = '{2,2}', updated_at = now() where id = 'xueqi21';
update public.words set pinyin = 'xīng qí rì', tone = 1, tones = '{1,2,4}', updated_at = now() where id = 'xingqiri114';
