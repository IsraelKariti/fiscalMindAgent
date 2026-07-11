import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import Services from '@/components/Services'
import HowItWorks from '@/components/HowItWorks'
import Pricing from '@/components/Pricing'
import Testimonials from '@/components/Testimonials'
import FAQ from '@/components/FAQ'
import CTA from '@/components/CTA'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <Services />
      <HowItWorks />
      <Pricing />
      {/* המלצות — comment out this line (and the import above) to hide the section */}
      <Testimonials />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  )
}
