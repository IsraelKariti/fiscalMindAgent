export default function CTA() {
  return (
    <section id="cta" className="py-28 bg-[#0A0A0F]">
      <div className="max-w-4xl mx-auto px-6">
        <div className="relative rounded-3xl overflow-hidden border border-blue-500/20 bg-[#0d0d1a] p-12 md:p-16 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(59,130,246,0.15),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_110%,rgba(139,92,246,0.1),transparent)]" />

          <div className="relative z-10">
            <p className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-5">
              התחילו היום
            </p>
            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-5">
              מוכנים להכניס AI
              <br />
              למשרד שלכם?
            </h2>
            <p className="text-[#94A3B8] text-lg mb-10 max-w-xl mx-auto">
              הצטרפו לרואי חשבון שכבר חוסכים 10+ שעות בשבוע עם FiscalMind. השיחה הראשונה חינמית — ללא לחץ, ללא מצגת מכירות.
            </p>

            <p className="text-[#64748B] text-xs">
              ללא כרטיס אשראי · הקמה תוך 4 שבועות · ביטול בכל עת
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
