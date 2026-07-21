import "./Hero.css";

function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">

        <h1>
          Detect <span>Deepfakes</span> with AI
        </h1>

        <p>
          Upload an image or video and let DeepSight analyze it
          using Artificial Intelligence.
        </p>

        <div className="hero-buttons">
          <button className="primary-btn">
            Upload Image
          </button>

          <button className="secondary-btn">
            Learn More
          </button>
        </div>

      </div>
    </section>
  );
}

export default Hero;