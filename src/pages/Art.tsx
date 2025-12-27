import Navigation from "../parts/Navigation";
import Header from "../parts/Header";
import Footer from "../parts/Footer";
import Divider from "../parts/Divider";

const Art = () => {
    return (
    <div className="min-h-screen text-blue-900 font-[sans-serif] flex flex-col">
      <Header />

      <div className="min-h-screen flex flex-col bg-cover bg-no-repeat bg-scroll" style={{ backgroundImage: 'var(--page-bg)' }}>
        <div className="flex lg:flex-row flex-col flex-grow p-4 max-w-7xl mx-auto w-full">
          
          <div className="flex-grow flex-col">
            <Navigation />
          </div>
    
          <main className="w-full lg:w-3/5 space-y-2 p-4">
            
            <div className="space-y-1 p-4 card-border rounded-lg shadow opacity-90">
              <h2 className="text-xl font-bold text-blue-700 mb-2 text-center">⚙️ Soon to be implement... (art)</h2>
              <div className="flex justify-center">
                <img className="rounded-lg border border-blue-200" src="https://media1.tenor.com/m/vk4u2ez6sHUAAAAd/kanna-eating.gif" />
              </div>
            </div>

            <Divider />  
          </main>

          <div className="flex-col">
            <div className="mt-3 mb-auto lg:w-[200px]">
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
    )
}

export default Art;