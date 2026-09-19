# Israeli financial institutions - issuer name table (research output)

Date: 2026-09-19

Rules followed: every entry comes from a source opened in this session. "-" means "not found in any opened source" (nothing was filled from memory).
Registered Hebrew names are copied from the regulator data. Short Hebrew names are the registered name without legal words (בנק / בע"מ / חברה לניהול ...) or the prefix that the regulator's fund names use. English names come from the Bank of Israel English list, the TASE PDF, or the Companies Registrar English-name field; many sector funds have no registered English name.
Line format: key | registered Hebrew name | common short Hebrew name(s) | English name(s) | fund brand names that differ from the company name | categories | source URL | OFFICIAL or FALLBACK

## SOURCES OPENED
- https://data.gov.il/dataset/gemelnet - Gemel-Net open dataset of the Capital Market, Insurance and Savings Authority (resources 2024-today, 2023, 1999-2022; read through the data.gov.il datastore API; latest period 2026-08). READABLE. Managing company names, company numbers, fund names, controlling corporation.
- https://data.gov.il/dataset/pensia-net - Pensia-Net open dataset of the same Authority (new pension funds only). READABLE.
- https://data.gov.il/dataset/insurance - Bituach-Net open dataset of the same Authority (insurers with savings / participating life policies, incl. bituach menahalim tracks). READABLE.
- https://data.gov.il/dataset/375 - Bank of Israel: 'List of banking corporations in Israel' (Hebrew + English resources). READABLE.
- https://data.gov.il/dataset/branches - Bank of Israel: register of physical bank branches (Hebrew + English). READABLE. Used for legacy bank codes and merge targets.
- https://data.gov.il/dataset/ica_companies - Ministry of Justice, Companies Registrar dataset: registered Hebrew and English company names by company number. READABLE. English names are copied exactly, including registrar typos (e.g. 'MAKCFET', 'K00R'). Cooperative societies (numbers 57xxxxxxx) are not in it.
- https://content.tase.co.il/media/uqtbtwm3/1150_foreign_bank_372262_eng.pdf - Tel Aviv Stock Exchange, 'How to become TASE Foreign Bank Member - Concise Guide, January 2026', page 11 'Members of TASECH & MAOF CH'. READABLE (PDF text).
- https://www.amitim.com/ - Amitim (old pension funds) own site. READABLE. FALLBACK source.
- https://www.meitav.co.il/en/ - Meitav own English site, READABLE; shows 'Meitav Provident and Pension', 'Meitav Trade'. Cross-check only.
- https://www.as-invest.co.il/en/ - Altshuler Shaham own English site, READABLE; shows 'Altshuler Shaham Investment House'. Cross-check only.
- https://he.wikipedia.org/wiki/הבורסה_לניירות_ערך_בתל_אביב - READABLE, cross-check only (its member list is older than the TASE PDF).
- Not readable: boi.org.il, gov.il (Capital Market Authority pages), tase.co.il member pages, harel-group.co.il / clalbit.co.il English pages (404), fnx.co.il/en (only 'Phoenix LTD.'), migdal.co.il/en (redirect to login host). Details in the section SOURCES THAT COULD NOT BE READ.

## BANKS
### Commercial banks (Bank of Israel list, category "בנקים רגילים") - issue bank balance confirmations, mortgage balance confirmations, securities portfolio statements
bank_esh | בנק אש ישראל בע"מ (bank code 3) | בנק אש; אש | Bank Esh Israel Ltd; Esh | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
bank_discount | בנק דיסקונט לישראל בע"מ (bank code 11) | בנק דיסקונט; דיסקונט | Israel Discount Bank Ltd; Discount Bank | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
fibi | בנק הבינלאומי הראשון לישראל בע"מ (bank code 31) | הבינלאומי; הבנק הבינלאומי; הבינלאומי הראשון | The First International Bank of Israel Ltd; First International Bank; FIBI | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
bank_hapoalim | בנק הפועלים בע"מ (bank code 12) | בנק הפועלים; הפועלים | Bank Hapoalim B.M; Hapoalim; Bank Hapoalim | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
bank_yahav | בנק יהב לעובדי המדינה בע"מ (bank code 4) | בנק יהב; יהב | Bank Yahav for Government Employees Ltd; Bank Yahav | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
bank_jerusalem | בנק ירושלים בע"מ (bank code 54) | בנק ירושלים | Bank of Jerusalem Ltd; Bank of Jerusalem | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
bank_leumi | בנק לאומי לישראל בע"מ (bank code 10) | בנק לאומי; לאומי | Bank Leumi Le-Israel B.M; Leumi; Bank Leumi | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
mizrahi_tefahot | בנק מזרחי טפחות בע"מ (bank code 20) | מזרחי טפחות; בנק מזרחי; טפחות | Mizrahi Tefahot Bank Ltd; Mizrahi Tefahot | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
bank_massad | בנק מסד בע"מ (bank code 46) | בנק מסד; מסד | Bank Massad Ltd; Bank Massad | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
mercantile_discount | בנק מרכנתיל דיסקונט בע"מ (bank code 17) | מרכנתיל; בנק מרכנתיל | Mercantile Discount Bank Ltd; Mercantile; Mercantile Discount Bank | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
one_zero | וואן זירו הבנק הדיגיטלי בע"מ (bank code 18) | וואן זירו | One Zero Digital Bank LTD; One Zero | - | bank | https://data.gov.il/dataset/375 | OFFICIAL

### Legacy bank names still present in the Bank of Israel branch register (not banking corporations any more)
otsar_hahayal | בנק אוצר החייל בע"מ (bank code 14) | אוצר החייל | - | brand of: fibi (closed branches point to bank 31) - branch register still lists 60 open branches under this bank code; not in the list of banking corporations; closed branches show merge target 31001 (31 = First International) | bank | https://data.gov.il/dataset/branches | OFFICIAL
ubank | יו-בנק בע"מ (bank code 26) | יו-בנק | - | owner bank not shown in the data - branch register still lists 10 open branches under this bank code; not in the list of banking corporations; closed branches show merge target - (31 = First International) | bank | https://data.gov.il/dataset/branches | OFFICIAL
pagi | בנק פועלי אגודת ישראל בע"מ (bank code 52) | פועלי אגודת ישראל | - | brand of: fibi (closed branches point to bank 31) - branch register still lists 17 open branches under this bank code; not in the list of banking corporations; closed branches show merge target 31001 (31 = First International) | bank | https://data.gov.il/dataset/branches | OFFICIAL

### Foreign banks (Bank of Israel list, category "בנקי חוץ") - listed separately, normally not retail
barclays | Barclays Bank PLC (bank code 27) | - | Barclays Bank PLC; Barclays | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
citibank | Citibank (bank code 22) | - | Citibank | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
hsbc | HSBC (bank code 23) | - | HSBC BANK plc; HSBC | - | bank | https://data.gov.il/dataset/375 | OFFICIAL
sbi | SBI State Bank of India (bank code 39) | - | State Bank Of India; SBI | - | bank | https://data.gov.il/dataset/375 | OFFICIAL

Note: the Bank of Israel list also holds "אלטשולר שחם פיננשיאל סרביסס בע"מ / Altshuler Shaham Financial Services Lt." (category financial institutions, code 60) and "מרכז סליקה בנקאי בע"מ / Bank Clearing Center Ltd" (joint service company). They are not counted as entries.

## MANAGING COMPANIES AND INSURERS
### Managing companies open to the general public (Gemel-Net target population "כלל האוכלוסיה"; pension = also in Pensia-Net)
actaeon | אקטיון בע"מ (company no. 515977338) | אקטיון | ACTAEON LTD | - | gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
altshuler_shaham | אלטשולר שחם גמל ופנסיה בע"מ (company no. 513173393) | אלטשולר שחם | ALTSHULER SHAHAM PROVIDENT FUNDS AND PENSION LTD | - | pension, gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
analyst | אנליסט קופות גמל בע"מ (company no. 511880460) | אנליסט | ANALYST PROVIDENT FUNDS LTD. | - | gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
ayalon_gemel | איילון קופות גמל בע"מ (company no. 517085874) | איילון; איילון גמל | AYALON PROVIDENT FUNDS LTD | - | gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
clal_pension_gemel | כלל פנסיה וגמל בע"מ (company no. 512244146) | כלל | CLAL PENSION AND PROVIDENT FUNDS LTD | בר קרן גמולים; הדס קופה מרכזית לפיצויים; כלל תמר; כלל ברזל; כלל גמל לעתיד; קופה כללית לפיצויים; כלל פנסיה משלימה | pension, gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
globalnet | גלובלנט ניהול קופות גמל בע"מ (company no. 516463635) | גלובלנט; גלובל נט | - | גלובל נט גמל IRA; גלובל נט השתלמות IRA | gemel, hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
harel_pension_gemel | הראל פנסיה וגמל בע"מ (company no. 512267592) | הראל | - | הראל דקל; הראל קמ"פ; הראל פרופיל אישי למעסיק; הראל עדי (funds taken over from Psagot, seen 2021) | pension, gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net | OFFICIAL
infinity | אינפיניטי השתלמות, גמל ופנסיה בע"מ (company no. 513621110) | אינפיניטי | - | - | pension, gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net | OFFICIAL
meitav | מיטב גמל ופנסיה בע"מ (company no. 512065202) | מיטב; מיטב דש (older fund names, last seen 2021-10) | MEITAV PROVIDENT FUNDS AND PENSION LTD | מיטב ביטחון; מיטב בטחון | pension, gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
menora_mivtachim_pension_gemel | מנורה מבטחים פנסיה וגמל בע"מ (company no. 512245812) | מנורה מבטחים; מנורה | MENORA MIVTACHIM PENSIONS AND GEMEL LTD | מור מנורה מבטחים; הילה (fund names seen until 2024-12); מבטחים מרכזית לפיצויים; מבטחים קופת גמל למטרות חופשה, חגים והבראה; מנורה מבטחים משלימה | pension, gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
migdal_makefet | מגדל מקפת קרנות פנסיה וקופות גמל בע"מ (company no. 512237744) | מגדל; מגדל מקפת | MIGDAL MAKCFET PENSION & PROVIDENT FUNDS LTD | מגדל מקפת אישית; מגדל מקפת משלימה; מקפת דמי מחלה; מקפת תקציבית | pension, gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
mor | מור גמל ופנסיה בע"מ (company no. 514956465) | מור | MORE PROVIDENT FUNDS AND PENSION LTD | אלפא מור | pension, gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
phoenix_pension_gemel | הפניקס פנסיה וגמל בע"מ (company no. 513026484) | הפניקס | THE PHOENIX PENSION AND PROVIDENT FUND LTD | הפניקס גמולה | pension, gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
slice | סלייס גמל בע"מ (company no. 514767490) | סלייס; סלייס גמל | - | - | gemel, hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
yelin_lapidot | ילין לפידות ניהול קופות גמל בע"מ (company no. 513611509) | ילין לפידות | YELIN-LAPIDOT PROVIDENT FUNDS MANAGEMENT LTD | - | gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL

### Insurers with savings policies (Bituach-Net) - life-insurance savings / bituach menahalim reports
ayalon_insurance | איילון חברה לביטוח בע"מ (company no. 520030677) | איילון | AYALON INSURANCE COMPANY LTD | - | insurance | https://data.gov.il/dataset/insurance ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
hachshara_insurance | הכשרה חברה לביטוח בע"מ (company no. 520042177) | הכשרה | HACHSHARA INSURANCE COMPANY LTD | tracks named after outside managers: הכשרה - אלטשולר שחם; הכשרה מנוהל באמצעות מור; הכשרה מנוהל באמצעות מיטב; הכשרה - אנליסט (the insurer is still Hachshara) | insurance | https://data.gov.il/dataset/insurance ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
phoenix_insurance | הפניקס חברה לביטוח בע"מ (company no. 520023185) | הפניקס | THE PHOENIX INSURANCE COMPANY LTD | אקסלנס אינווסט; הפניקס אקסלנס; הפניקס Apollo; הפניקס BlackRock | insurance | https://data.gov.il/dataset/insurance ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
harel_insurance | הראל חברה לביטוח בע"מ (company no. 520004078) | הראל | HAREL INSURANCE COMPANY LTD | הראל fidelity | insurance | https://data.gov.il/dataset/insurance ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
idi_insurance | ישיר -איי. די. איי. חברה לביטוח בע"מ (Bituach-Net name) / איי.די.איי. חברה לביטוח בע"מ (Companies Registrar name) (company no. 513910703) | ישיר; איי.די.איי; אי.די.אי | I.D.I. INSURANCE COMPANY LTD | - | insurance | https://data.gov.il/dataset/insurance ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
clal_insurance | כלל חברה לביטוח בע"מ (company no. 520024647) | כלל; כלל ביטוח | CLAL INSURANCE COMPANY LTD | - | insurance | https://data.gov.il/dataset/insurance ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
migdal_insurance | מגדל חברה לביטוח בע"מ (company no. 520004896) | מגדל; מגדל ביטוח | MIGDAL INSURANCE COMPANY LTD | - | insurance | https://data.gov.il/dataset/insurance ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
menora_mivtachim_insurance | מנורה מבטחים חברה לביטוח בע"מ (Bituach-Net name) / מנורה מבטחים ביטוח בע"מ (Companies Registrar name) (company no. 520042540) | מנורה מבטחים; מנורה | MENORA MIVTACHIM INSURANCE LTD. | - | insurance | https://data.gov.il/dataset/insurance ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL

### Non-bank TASE clearing-house members (securities portfolio statements)
altshuler_shaham_trade | אלטשולר שחם טרייד בע"מ (company no. 516414992) | אלטשולר שחם טרייד | Altshuler Shaham Trade Ltd.; registrar spelling: ALTSHULER SHAHAM TRADE LTD | - | portfolio | https://content.tase.co.il/media/uqtbtwm3/1150_foreign_bank_372262_eng.pdf ; Hebrew registered name: https://data.gov.il/dataset/ica_companies | OFFICIAL
excellence_securities | אקסלנס ניהול השקעות וניירות ערך בע"מ (company no. 511974834) | אקסלנס | Excellence Investments Management and Securities Ltd.; registrar spelling: EXCELLENCE INVESTMENTS MANAGEMENT AND SECURITIES LTD | - | portfolio | https://content.tase.co.il/media/uqtbtwm3/1150_foreign_bank_372262_eng.pdf ; Hebrew registered name: https://data.gov.il/dataset/ica_companies | OFFICIAL
fair_financial | פייר פיננשיאל טכנולוג'יז בע"מ (company no. 516471018) | פייר | Fair Financial Technologies Ltd.; registrar spelling: FAIR FINANCIAL TECHNOLOGIES LTD | - | portfolio | https://content.tase.co.il/media/uqtbtwm3/1150_foreign_bank_372262_eng.pdf ; Hebrew registered name: https://data.gov.il/dataset/ica_companies | OFFICIAL
meitav_trade | מיטב טרייד בע"מ (company no. 510528276) | מיטב טרייד | Meitav Trade Ltd.; registrar spelling: MEITAV TRADE LTD | - | portfolio | https://content.tase.co.il/media/uqtbtwm3/1150_foreign_bank_372262_eng.pdf ; Hebrew registered name: https://data.gov.il/dataset/ica_companies | OFFICIAL
psagot_securities | פסגות ניירות ערך בע"מ (company no. 513765396) | פסגות | Psagot Securities Ltd.; registrar spelling: PSAGOT SECURITIES LTD | - | portfolio | https://content.tase.co.il/media/uqtbtwm3/1150_foreign_bank_372262_eng.pdf ; Hebrew registered name: https://data.gov.il/dataset/ica_companies | OFFICIAL
ibi | שרותי בורסה והשקעות בישראל - אי.בי.אי. - בע"מ (company no. 510657554) | אי.בי.אי; IBI | Israel Brokerage and Investments IBI Ltd.; registrar spelling: ISRAEL BROKERAGE AND INVESTMENTS - IBI LTD | - | portfolio | https://content.tase.co.il/media/uqtbtwm3/1150_foreign_bank_372262_eng.pdf ; Hebrew registered name: https://data.gov.il/dataset/ica_companies | OFFICIAL

## SECTOR / SELF-MANAGED FUNDS
### Sector and employer managing companies in Gemel-Net (target population: a sector or one employer)
Note: 4 lines below (mivtachim_old, makefet_old, haklaim_pension_old, binyan_pension_old) carry registered names from Gemel-Net; the link to the Amitim fund of the same name was made by name match only, not by a register.
academics_social_sciences_hishtalmut | החברה לניהול קרן השתלמות לאקדמאים במדעי החברה והרוח בע"מ (company no. 520027954) | קרן השתלמות לאקדמאים במדעי החברה והרוח | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
agur | עגור חברה לניהול קופות גמל וקרנות השתלמות בע"מ (company no. 520024985) | עגור | - | עגור קרן השתלמות למורים בבתי הספר העל יסודיים | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
ami | עמ"י - חברה לניהול קופות גמל ענפיות בע"מ (company no. 520042581) | עמ"י | AMI - GOVERNMENT EMPLOYEES PROVIDENT FUND MANAGEMENT COMPANY LTD | קופת גמל עמ"י; עמ"י קופת גמל להשקעה | gemel | https://data.gov.il/dataset/gemelnet ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
aram_gemulim | ארם גמולים - חברה לניהול קופות גמל בע''מ (company no. 510773922) | ארם; ארם גמולים | - | ארם - קופת גמל לתגמולים של ארגון הרופאים | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
beit_lamed_dalet | חברת ב'ת למ'ד דל'ת בע"מ (company no. 510142789) | בל"ד | - | קופת בל"ד | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
binyan_pension_old | קרן הביטוח והפנסיה של פועלי בנין ועבודות ציבוריות אגודה שיתופית בע"מ (company no. 570005850) | בניין | - | Amitim brand: בניין קרן פנסיה | pension (old fund, Amitim), gemel | https://data.gov.il/dataset/gemelnet ; Amitim membership and brand name (FALLBACK part): https://www.amitim.com/ | OFFICIAL
el_al_employees_gemel | קופת תגמולים של עובדי אל על נתיבי אוויר לישראל בע"מ אגודה שיתופית (company no. 570011767) | גמל-על | - | גמל-על, קופת תגמולים לעובדי אל על | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
gal_teachers_gemel | גל -ניהול קופות גמל לעובדי הוראה בע"מ (company no. 512711409) | גל | - | קופת גמל גל; קופת גמל כלנית; גל קופ"ג להשקעה | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
haifa_municipality_gemel | קופת"ג של עובדי עירית חיפה (company no. 570005959) | קופת תגמולים עיריית חיפה | - | - | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
haklaim_pension_old | קרן ביטוח ופנסיה לפועלים חקלאים ובלתי מקצועיים בישראל אגודה שיתופית בע"מ (company no. 570007476) | חקלאים | - | Amitim brand: חקלאים קרן פנסיה | pension (old fund, Amitim), gemel | https://data.gov.il/dataset/gemelnet ; Amitim membership and brand name (FALLBACK part): https://www.amitim.com/ | OFFICIAL
handesaim_technaim_gemel | הנדסאים וטכנאים - חברה לניהול קופות גמל בע"מ (company no. 520042607) | הנדסאים | - | קופת גמל הנדסאים; הנדסאים קופה להשקעה | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
handesaim_technaim_hishtalmut | החברה לניהול קרן ההשתלמות להנדסאים וטכנאים בע"מ (company no. 520028556) | קרן השתלמות להנדסאים וטכנאים | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
hebrew_university_employees_gemel | חברת הגמל לעובדי האוניברסיטה העברית בע"מ (company no. 510960586) | חברת הגמל לעובדי האוניברסיטה העברית | - | - | gemel, hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
iai_employees_gemel | קופת תגמולים של עובדי התעשיה האוירית לישראל בע"מ (company no. 570014928) | קופת תגמולים של עובדי התעשיה האוירית | - | - | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
iec_employees_hishtalmut | החברה המנהלת של קרן השתלמות של עובדי חברת החשמל לישראל בע"מ (company no. 520034968) | קרן השתלמות של עובדי חברת החשמל | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
judges_hishtalmut | החברה לניהול קרן השתלמות לשופטים בע"מ (company no. 520030743) | קרן השתלמות לשופטים | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
jurists_hishtalmut | החברה לניהול קרן השתלמות למשפטנים בע"מ (company no. 520028861) | קרן השתלמות למשפטנים | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
kahar_pharmacists_hishtalmut | ק.ה.ר - קרן השתלמות לרוקחים בע"מ (company no. 520030198) | ק.ה.ר | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
kav_habriut | קו הבריאות חברה לניהול קופות גמל בע"מ (company no. 512008335) | קו הבריאות | - | - | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
keren_hisachon_tzva_keva | קרן החסכון לצבא הקבע - חברה לניהול קופות גמל בע"מ (company no. 511033060) | קרן החיסכון לצבא הקבע | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
kla_social_workers_hishtalmut | ק.ל.ע. - חברה לניהול קרן השתלמות לעובדים סוציאליים בע"מ (company no. 520030941) | ק.ל.ע | - | ק.ל.ע - קרן השתלמות לעובדים סוציאלים | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
ksm_biochemists_hishtalmut | החברה לניהול קרן השתלמות לביוכימאים ומקרוביולוגים בע"מ (company no. 520029620) | ק.ס.מ | - | ק.ס.מ. קרן השתלמות לביוכימאים ומקרוביולוגים | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
leumi_employees_gemel | החברה לניהול קופות התגמולים והפיצויים של עובדי בנק לאומי בע"מ (company no. 520005497) | קופת התגמולים של עובדי בנק לאומי | THE MANAGEMENT COMPANY OF LEUMI EMPLOYEES' PROVIDENT FUND LTD | - | gemel | https://data.gov.il/dataset/gemelnet ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
leumi_kamap | לאומי קמ"פ בע"מ (company no. 510694821) | לאומי קמ"פ | - | לאומי קופה מרכזית לפיצויים (2006) | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
machar | מחר - חברה לניהול קופות גמל בע"מ (company no. 520042615) | מחר | - | מחר גמל; קופת גמל מחר | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
machog | מחוג - מינהל גמל לעובדי חברת חשמל לישראל בע"מ (company no. 512362914) | מחוג | - | מחוג חיסכון פלוס | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
makefet_old | קרן מקפת מרכז לפנסיה ותגמולים אגודה שיתופית בע"מ (company no. 570009852) | מקפת; קרן מקפת | - | Amitim brand: מקפת קרן פנסיה | pension (old fund, Amitim), gemel | https://data.gov.il/dataset/gemelnet ; Amitim membership and brand name (FALLBACK part): https://www.amitim.com/ | OFFICIAL
minhal_clerks_hishtalmut | החברה המנהלת של מינהל קרן ההשתלמות לפקידים עובדי המנהל והשירותים בע"מ (company no. 520030990) | מינהל | - | מינהל - קרן ההשתלמות לפקידים עובדי המינהל והשירותים | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
mivtachim_old | מבטחים מוסד לביטוח סוציאלי של העובדים בע"מ (company no. 520019688) | מבטחים | - | מבטחים - קופת גמל למחלה ותאונה; Amitim brand: מבטחים קרן פנסיה | pension (old fund, Amitim), gemel | https://data.gov.il/dataset/gemelnet ; Amitim membership and brand name (FALLBACK part): https://www.amitim.com/ | OFFICIAL
omega_engineers_hishtalmut | מנורה מבטחים והסתדרות המהנדסים ניהול קופות גמל בע"מ (company no. 520027715) | אומגה | - | אומגה קרן השתלמות | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
os_social_workers_gemel | עו"ס - חברה לניהול קופות גמל בע"מ (company no. 520042573) | עו"ס | - | קופת גמל עו"ס | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
otzam_coop_gemel | עוצ"מ - אגודה שיתופית לניהול קופות גמל בע"מ (company no. 570009449) | עוצ"מ | - | - | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
otzam_hishtalmut | עוצ"מ חברה לניהול קופות גמל והשתלמות בע"מ (company no. 520031659) | עוצ"מ | - | קרן השתלמות עוצ"מ | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
reut | רעות חברה לניהול קופות גמל בע"מ (company no. 510806870) | רעות | - | רעות קרן השתלמות | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
rom | החברה המנהלת של רום קרן ההשתלמות לעובדי הרשויות המקומיות בע"מ (company no. 520031824) | רום | - | רום - קרן השתלמות לעובדי הרשויות המקומיות | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
secondary_teachers_hishtalmut | קרנות השתלמות למורים תיכוניים, מורי סמינרים ומפקחים - חברה מנהלת בע"מ (company no. 520028390) | קרן השתלמות למורים תיכוניים | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
shibolet | שיבולת - חברה לניהול קופות גמל בע"מ (company no. 520030693) | שיבולת | - | שיבולת קרן השתלמות; שיבולת קופת תגמולים | gemel, hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
state_employees_hishtalmut | החברה לניהול קרן ההשתלמות לעובדי המדינה בע"מ (company no. 520032269) | קרן השתלמות לעובדי המדינה | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
teachers_kindergarten_hishtalmut | קרנות השתלמות למורים ולגננות - חברה מנהלת בע"מ (company no. 520027251) | קרן השתלמות למורים וגננות | - | - | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
tel_aviv_municipality_gemel_company | חברה לניהול קופות גמל של העובדים בעיריית תל - אביב יפו בע"מ (company no. 513452003) | קופות גמל של העובדים בעיריית תל אביב יפו | PROVIDENT FUND MANAGEMENT COMPANY FOR THE WORKERS OF TEL AVIV-YAFO MUNICIPALITY LTD | - | gemel | https://data.gov.il/dataset/gemelnet ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
tel_aviv_municipality_tagmulim_coop | תגמולים של עובדים בעירית ת"א-יפו א.ש. בע"מ (company no. 570002618) | קופת תגמולים של העובדים בעירית תל אביב-יפו | - | - | gemel | https://data.gov.il/dataset/gemelnet | OFFICIAL
yachad_physicians | יחד רופאים - חברה לניהול קופות גמל בע"מ (company no. 510930654) | יחד; יחד רופאים | YACHAD PHYSICIANS - MANAGEMENT COMPANY FOR PROVIDENT FUNDS LTD | יחד קרן השתלמות לרופאים; יחד רופאים קופת גמל להשקעה | gemel, hishtalmut | https://data.gov.il/dataset/gemelnet ; English name: https://data.gov.il/dataset/ica_companies | OFFICIAL
yahav_nurses | יהב אחים ואחיות - חברה לניהול קופות גמל בע"מ (company no. 510927536) | יהב אחים ואחיות | - | יהב - קרן השתלמות וחיסכון לאחים ואחיות | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL
yahav_prh | יהב - פ.ר.ח. - חברה לניהול קופות גמל בע"מ (company no. 510930670) | יהב פ.ר.ח | - | יהב קרן השתלמות וחסכון פ.ר.ח | hishtalmut | https://data.gov.il/dataset/gemelnet | OFFICIAL

### Old pension funds under Amitim that are not in the regulator data opened
amitim | עמיתים קרנות הפנסיה הוותיקות | עמיתים | Amitim | umbrella brand of the 8 old pension funds in the arrangement: מבטחים, מקפת, חקלאים, בניין, קג"מ, נתיב, אגד, הדסה | pension | https://www.amitim.com/ | FALLBACK
kgm_pension_old | קג"מ קרן פנסיה (name as printed on the Amitim site; registered name not found) | קג"מ; קג״מ | - | - | pension | https://www.amitim.com/ | FALLBACK
nativ_pension_old | נתיב קרן פנסיה (name as printed on the Amitim site; registered name not found) | נתיב | - | - | pension | https://www.amitim.com/ | FALLBACK
egged_pension_old | אגד קרן פנסיה (name as printed on the Amitim site; registered name not found) | אגד | - | - | pension | https://www.amitim.com/ | FALLBACK
hadassah_pension_old | הדסה קרן פנסיה (name as printed on the Amitim site; registered name not found) | הדסה | - | - | pension | https://www.amitim.com/ | FALLBACK

## MERGERS / RENAMES
Format: old name -> surviving company | approximate date | source. Found by following fund IDs between reporting periods in the regulator data. The regulator restates fund names, so old periods may show the new fund name.
- פסגות קופות גמל ופנסיה בע"מ (PSAGOT PROVIDENT FUNDS AND PENSION LTD, company no. 513765347) -> funds split between אלטשולר שחם גמל ופנסיה בע"מ (9 tracks sampled), הראל פנסיה וגמל בע"מ (10 tracks, the 'הראל עדי' compensation funds; Psagot pension funds also listed under Harel until 2021-09) and סלייס גמל בע"מ (2 IRA tracks) | last reported 2021-10; registrar status: liquidated due to merger | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net ; https://data.gov.il/dataset/ica_companies
- הלמן - אלדובי קופות גמל ופנסיה בע"מ (HALMAN - ALDUBI PROVIDENT AND PENSION FUNDS LTD, company no. 512227265) -> הפניקס פנסיה וגמל בע"מ | last reported 2021-11, funds under Phoenix from 2021-10/12; registrar status: liquidated due to merger | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/ica_companies
- הפניקס פנסיה וגמל בע"מ -> גלובלנט ניהול קופות גמל בע"מ (only the 'גלובל נט' IRA / personal-management funds, 4 tracks; these came to Phoenix from Halman-Aldubi) | first seen under Globalnet 2022-05/06 | https://data.gov.il/dataset/gemelnet
- כור-תדיראן גמל בע"מ (K00R-TADIRAN PROVIDENT FUNDS LTD as spelled in the registrar, company no. 512459751) -> surviving company not shown in the data | last reported 2019-05; registrar status: voluntary liquidation | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/ica_companies
- שובל - חברה לניהול קופת גמל מפעלית בע"מ (company no. 520042631) -> הנדסאים וטכנאים - חברה לניהול קופות גמל בע"מ | last reported 2019-12, funds under new manager by 2020-06 | https://data.gov.il/dataset/gemelnet
- שדות - חברה לניהול קופות גמל בע"מ -> הנדסאים וטכנאים - חברה לניהול קופות גמל בע"מ | between 2018-12 and 2019-06 | https://data.gov.il/dataset/gemelnet
- הגומל חברה לניהול קופות גמל בע"מ -> גל - ניהול קופות גמל לעובדי הוראה בע"מ | between 2018-12 and 2019-06 | https://data.gov.il/dataset/gemelnet
- החברה לניהול קופות גמל של עובדי בנק דיסקונט בע"מ -> הראל פנסיה וגמל בע"מ | between 2018-12 and 2019-06 | https://data.gov.il/dataset/gemelnet
- החברה לניהול קופת התגמולים והפנסיה של עובדי הסוכנות היהודית לארץ ישראל בע"מ (company no. 520022518) -> no longer reported; surviving manager not shown in the data (registrar still shows the company as active) | last reported 2023-12 | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/ica_companies
- מיטב דש (fund brand, e.g. 'מיטב דש פנסיה מקיפה') -> מיטב (same company מיטב גמל ופנסיה בע"מ, no. 512065202) | 'מיטב דש' fund names last seen 2021-10; controlling corporation is still listed as מיטב דש השקעות בע"מ | https://data.gov.il/dataset/pensia-net ; https://data.gov.il/dataset/gemelnet
- NEW (not a merger): איילון קופות גמל בע"מ (AYALON PROVIDENT FUNDS LTD, company no. 517085874) first reported 2026-07 | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/ica_companies
- NEW (not a merger): אקטיון בע"מ (ACTAEON LTD) first reported 2024-05; אינפיניטי and מור started pension funds 2022-04 / 2022-05 | https://data.gov.il/dataset/gemelnet ; https://data.gov.il/dataset/pensia-net
- הילה (fund brand under מנורה מבטחים פנסיה וגמל בע"מ) -> name no longer reported after 2024-12 | 2024-12 | https://data.gov.il/dataset/gemelnet
- בנק אוצר החייל בע"מ / בנק פועלי אגודת ישראל בע"מ / יו-בנק בע"מ -> הבנק הבינלאומי הראשון לישראל בע"מ (shown only indirectly: none of the three is in the list of banking corporations; closed branches of אוצר החייל and פועלי אגודת ישראל point to merge target bank 31; nothing is shown for יו-בנק) | date not shown in the data | https://data.gov.il/dataset/branches ; https://data.gov.il/dataset/375
- איילון חברה לביטוח בע"מ: registrar shows two companies with this name - no. 520042169 'liquidated due to merger' and no. 520030677 active | date not shown | https://data.gov.il/dataset/ica_companies

## SOURCES THAT COULD NOT BE READ
- https://www.boi.org.il/en/economic-roles/supervisor-of-banks/banking-corporations-in-israel/ and https://www.boi.org.il/roles/supervisionregulation/banking-corporations/ - Bank of Israel site: blocked by a Radware browser check. Used instead: the Bank of Israel's own datasets on data.gov.il (still OFFICIAL).
- https://www.gov.il/he/departments/capital_market_authority and other gov.il pages of the Capital Market Authority (lists of insurers / managing companies) - HTTP 403 (Cloudflare 'Just a moment'). Used instead: the Authority's own Gemel-Net / Pensia-Net / Bituach-Net datasets on data.gov.il (still OFFICIAL).
- https://gemelnet.cma.gov.il/ , https://pensyanet.cma.gov.il/ , https://bituachnet.cma.gov.il/ - home pages load, but the company lists sit behind interactive forms (first WebFetch attempt: connection reset). The same data was read from the Authority's data.gov.il datasets.
- https://www.tase.co.il/en/content/members/list and https://www.tase.co.il/he/content/members/list - JavaScript app, no content; https://api.tase.co.il/... - HTTP 403; https://info.tase.co.il/Eng/about_tase/tase_members/Pages/tase_ch_members_list.aspx - no response. Used instead: official TASE PDF guide (January 2026) that prints the clearing-house member list (OFFICIAL).
- Israel Securities Authority (isa.gov.il) list of licensed portfolio managers - not attempted in depth (task said to skip the long list); no ISA dataset found on data.gov.il. Portfolio entries are TASE clearing-house members only.
- Register of OLD pension funds (קרנות פנסיה ותיקות): the Pensia-Net dataset covers only new comprehensive / general funds. 4 of the 8 Amitim funds appear in Gemel-Net with registered names; the other 4 (קג"מ, נתיב, אגד, הדסה) were taken from amitim.com = FALLBACK. Old funds outside Amitim were not found in any opened source and are NOT listed.
- Hebrew Wikipedia pages 'קרן פנסיה ותיקה', 'עמיתים (קרנות פנסיה)', 'חבר בורסה' - do not exist (404). 'הבורסה לניירות ערך בתל אביב' was opened but only used as a cross-check; no entry relies on it.

## COUNTS
- BANKS: 18 (commercial 11, legacy names 3, foreign 4)
- MANAGING COMPANIES AND INSURERS: 29 (managing companies 15, insurers 8, brokers 6)
- SECTOR / SELF-MANAGED FUNDS: 49 (Gemel-Net sector companies 44, Amitim fallback 5)
- MERGERS / RENAMES: 15 lines
- Total entries: 96 - OFFICIAL 91, FALLBACK 5
