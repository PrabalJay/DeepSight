import "./Features.css";

function Features() {
  return (
    <section className="features">

      <div className="card">
        <h2>⚡ Fast Detection</h2>
        <p>Analyze images and videos within seconds.</p>
      </div>

      <div className="card">
        <h2>🤖 AI Powered</h2>
        <p>Uses deep learning to detect manipulated media.</p>
      </div>

      <div className="card">
        <h2>🔒 Secure</h2>
        <p>Your uploaded files remain private and protected.</p>
      </div>

    </section>
  );
}

export default Features;