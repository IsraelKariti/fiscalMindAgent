import Navbar from '@/components/Navbar'
import Hero from '@/components/Hero'
import Services from '@/components/Services'
import HowItWorks from '@/components/HowItWorks'
// מחירים — uncomment this import (and the line below) to restore the section
// import Pricing from '@/components/Pricing'
import Testimonials from '@/components/Testimonials'
import FAQ from '@/components/FAQ'
import CTA from '@/components/CTA'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        דלגו לתוכן הראשי
      </a>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Services />
        <HowItWorks />
        {/* מחירים — uncomment this line (and the import above) to restore the section */}
        {/* <Pricing /> */}
        {/* המלצות — comment out this line (and the import above) to hide the section */}
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
