import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Mic, Cpu, Radio, Smartphone } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

// Highly procedural, jagged SVG Pine Tree and Dead Tree Generator
function generatePinePath(seed, isDead) {
  const random = () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  let path = `M 50, ${random() * 5} `; 
  let leftSide = [];
  let rightSide = [];
  let currentY = 5 + random() * 5;
  let currentWidth = 1.5;

  const branches = isDead ? 6 + Math.floor(random() * 4) : 15 + Math.floor(random() * 10);
  
  for (let i = 0; i < branches; i++) {
    const leftDrop = isDead ? 10 : 4;
    const leftX = 50 - currentWidth - random() * (isDead ? 8 : currentWidth * 0.8);
    const leftY = currentY + random() * leftDrop;
    leftSide.push(`L ${leftX}, ${leftY}`);
    
    // Irregular stubs for living pines
    if (!isDead && random() > 0.4) {
       leftSide.push(`L ${leftX + random()*3}, ${leftY + 2}`);
       leftSide.push(`L ${leftX - 1}, ${leftY + 4}`);
    }

    const leftInnerX = 50 - (currentWidth * 0.4) - random() * 2;
    const leftInnerY = leftY + (isDead ? 1 : 2 + random() * 3);
    leftSide.push(`L ${leftInnerX}, ${leftInnerY}`);

    const rightDrop = isDead ? 10 : 4;
    const rightX = 50 + currentWidth + random() * (isDead ? 8 : currentWidth * 0.8);
    const rightY = currentY + random() * rightDrop;
    
    // Inner back
    const rightInnerX = 50 + (currentWidth * 0.4) + random() * 2;
    const rightInnerY = rightY + (isDead ? 1 : 2 + random() * 3);
    rightSide.unshift(`L ${rightInnerX}, ${rightInnerY}`); 
    
    // Irregular stubs for living pines
    if (!isDead && random() > 0.4) {
       rightSide.unshift(`L ${rightX - 1}, ${rightY + 4}`);
       rightSide.unshift(`L ${rightX + random()*3}, ${rightY + 2}`);
    }

    rightSide.unshift(`L ${rightX}, ${rightY}`); // outer

    currentY += 100 / branches;
    currentWidth += isDead ? (0.5 + random()) : (2 + random() * 2.5);
  }

  leftSide.push(`L ${50 - (isDead ? 1 : 3)}, 100`);
  rightSide.unshift(`L ${50 + (isDead ? 1 : 3)}, 100`);

  return path + leftSide.join(" ") + " L 50, 100 " + rightSide.join(" ") + " Z";
}

const TreeSilhouette = ({ fill, height, offset, seedBase, density }) => {
  const trees = [];
  for (let i = 0; i < density; i++) {
    // 10% chance for a dead/bare tree for realism
    const isDead = (Math.random() < 0.1); 
    const x = (i / density) * 100 + (Math.random() * (100 / density) * 0.5);
    const scale = 0.6 + Math.random() * 0.6;
    const path = generatePinePath(seedBase + i, isDead);
    
    trees.push(
      <svg key={i} viewBox="0 0 100 100" preserveAspectRatio="none" 
           style={{ position: 'absolute', bottom: offset, height: `${height * scale}%`, width: `${20 * scale}%`, left: `${x}%`, fill: fill, opacity: isDead ? 0.7 : 0.95 }}>
        <path d={path} />
      </svg>
    );
  }
  return <div style={{width: '100%', height: '100%', position: 'absolute'}}>{trees}</div>;
};

const LandingPage = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  useEffect(() => {
    // --- CANVAS STARS & FIREFLIES ---
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const stars = [];
    for (let i = 0; i < 150; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.7, 
        radius: Math.random() * 1.5,
        opacity: Math.random() * 0.6,
        twinkleSpeed: Math.random() * 0.05,
      });
    }

    // 25 Fireflies for performance
    const fireflies = [];
    const colors = ['#00ff41', '#39ff14', '#7fff00', '#adff2f'];
    for (let i = 0; i < 25; i++) {
        fireflies.push({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 1.5 + 1.5,
            color: colors[Math.floor(Math.random() * colors.length)],
            speedY: (Math.random() - 0.2) * 0.4, 
            driftBaseX: Math.random() * width,
            driftRadius: Math.random() * 40 + 10,
            driftSpeed: Math.random() * 0.01 + 0.005,
            life: Math.random() * Math.PI * 2,
            blinkSpeed: Math.random() * 0.05 + 0.01
        });
    }

    let animationFrameId;

    const renderCanvas = () => {
      ctx.clearRect(0, 0, width, height);
      
      stars.forEach(s => {
        s.opacity += Math.sin(Date.now() * s.twinkleSpeed * 0.05) * 0.01;
        if (s.opacity < 0.1) s.opacity = 0.1;
        if (s.opacity > 0.8) s.opacity = 0.8;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        ctx.fill();
      });

      fireflies.forEach(f => {
        f.y -= f.speedY;
        f.life += f.blinkSpeed;
        const currentX = f.driftBaseX + Math.sin(Date.now() * f.driftSpeed) * f.driftRadius; 
        if (f.y < -20) { f.y = height + 20; f.driftBaseX = Math.random() * width; } 
        else if (f.y > height + 20) { f.y = -20; }

        const opacity = Math.max(0.1, Math.sin(f.life) * 0.9);
        ctx.beginPath();
        ctx.arc(currentX, f.y, f.size, 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.globalAlpha = opacity;
        ctx.shadowBlur = 15;
        ctx.shadowColor = f.color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0; 
      });
      animationFrameId = requestAnimationFrame(renderCanvas);
    };
    renderCanvas();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    // --- GSAP SCROLLTRIGGERS FOR PARALLAX ---
    // The background is FIXED. GSAP only moves it natively.
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ".parallax-wrapper",
        start: "top top",
        end: "bottom bottom",
        scrub: 1
      }
    });

    tl.to(".layer-sky", { y: 150, ease: 'none' }, 0);
    tl.to(".layer-moon-container", { y: 250, ease: 'none' }, 0);
    tl.to(".mist-strip", { y: -50, opacity: 0, ease: 'none' }, 0);
    tl.to(".layer-trees-1", { y: -30, scale: 1.05, ease: 'none' }, 0);
    tl.to(".layer-trees-2", { y: -80, scale: 1.15, ease: 'none' }, 0);
    tl.to(".layer-trees-3", { y: -150, scale: 1.3, ease: 'none' }, 0);
    tl.to(".layer-trees-4", { y: -300, scale: 1.8, ease: 'power1.in' }, 0);
    tl.to(".layer-trees-5", { y: -600, scale: 3.0, opacity: 0.5, ease: 'power2.in' }, 0);
    
    // Animate numbers up
    gsap.utils.toArray('.count-up').forEach((el) => {
        const targetRaw = el.getAttribute('data-target');
        const targetVal = parseFloat(targetRaw);
        const format = el.getAttribute('data-format') || 'number'; 

        gsap.to(el, {
            scrollTrigger: { trigger: el, start: "top 85%" },
            innerHTML: targetVal,
            duration: 2,
            snap: { innerHTML: format === 'float' ? 0.01 : 1 },
            ease: "power2.out",
            onUpdate: function() {
                if(format === 'currency') el.innerHTML = "₹" + Number(el.innerHTML).toLocaleString();
                else if(format === 'float') el.innerHTML = Number(el.innerHTML).toFixed(2);
                else el.innerHTML = Number(el.innerHTML).toLocaleString();
            }
        });
    });

    // Fade in sections
    gsap.utils.toArray('.fade-in-section').forEach((sec) => {
        gsap.fromTo(sec, 
            { opacity: 0, y: 50 }, 
            { opacity: 1, y: 0, duration: 1, ease: 'power2.out', scrollTrigger: { trigger: sec, start: "top 85%" } }
        );
    });

    // Stagger How it Works Steps
    gsap.fromTo(".step-card", 
        { opacity: 0, x: -50 },
        { opacity: 1, x: 0, duration: 0.8, stagger: 0.2, ease: "power2.out", 
          scrollTrigger: { trigger: "#how-it-works", start: "top 75%" } 
        }
    );

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  const handleMouseMove = (e) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = (e.clientX - w / 2) / w;
    gsap.to(".layer-trees-1", { x: -x * 5, duration: 2 });
    gsap.to(".layer-trees-2", { x: -x * 12, duration: 2 });
    gsap.to(".layer-trees-3", { x: -x * 25, duration: 2 });
    gsap.to(".layer-trees-4", { x: -x * 50, duration: 2 });
    gsap.to(".layer-trees-5", { x: -x * 90, duration: 2 });
  };

  return (
    <div className="parallax-wrapper" style={{ backgroundColor: '#000802', fontFamily: "'Exo 2', sans-serif" }} onMouseMove={handleMouseMove}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;600&family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');
        
        html { scroll-behavior: smooth; }
        html, body, #root { margin: 0; padding: 0; min-height: 100vh; overflow-x: hidden; overflow-y: auto; }

        .parallax-wrapper { position: relative; color: #d4ffd4; }

        /* FIXED BACKGROUND SYSTEM for performance */
        .bg-container {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          height: 100vh; width: 100vw; z-index: 0; overflow: hidden; pointer-events: none;
          will-change: transform;
        }

        .layer-sky { position: absolute; width: 100%; height: 100%; background: linear-gradient(to bottom, #000c03 0%, #001a05 40%, #002208 100%); will-change: transform; }
        .layer-moon-container { position: absolute; top: 5%; right: 10%; width: 200px; height: 200px; will-change: transform; }

        .moon {
          position: absolute; width: 120px; height: 120px; border-radius: 50%; background: #fffff0;
          box-shadow: 0 0 100px 50px rgba(255,255,240,0.15), inset -15px -15px 30px rgba(0,0,0,0.4);
          /* Realistic crater patches */
          background-image: 
             radial-gradient(circle at 30% 40%, rgba(0,0,0,0.1) 0%, transparent 15%),
             radial-gradient(circle at 60% 70%, rgba(0,0,0,0.15) 0%, transparent 25%),
             radial-gradient(circle at 75% 30%, rgba(0,0,0,0.08) 0%, transparent 10%);
        }

        .god-rays {
           position: absolute; top: 60px; left: 60px; width: 200vw; height: 150vh;
           background: conic-gradient(from 180deg at 0 0, transparent 0deg, rgba(255,255,240,0.04) 20deg, transparent 40deg, rgba(255,255,240,0.02) 60deg, transparent 80deg);
           transform: translateX(-50vw); pointer-events: none; z-index: 1;
        }

        .mist-strip {
          position: absolute; width: 200%; background: repeating-linear-gradient(90deg, transparent, rgba(0,255,65,0.04) 15%, transparent 30%);
          filter: blur(40px); animation: drift linear infinite; pointer-events: none; will-change: transform;
        }
        .mist-1 { bottom: 40%; height: 30%; animation-duration: 150s; opacity: 0.6; z-index: 2; transform-origin: left; }
        .mist-2 { bottom: 20%; height: 40%; animation-duration: 110s; animation-direction: reverse; opacity: 0.8; z-index: 4; transform-origin: right; }
        .mist-3 { bottom: 10%; height: 25%; animation-duration: 90s; opacity: 1; z-index: 6; transform-origin: left; }
        
        @keyframes drift { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

        .layer-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 8; will-change: transform; }

        .vignette {
           position: absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index: 10;
           box-shadow: inset 0 0 250px rgba(0,8,2,0.95);
        }

        /* FORESTS - will-change for perf */
        .layer-trees-1, .layer-trees-2, .layer-trees-3, .layer-trees-4, .layer-trees-5 { will-change: transform; }

        /* CONTENT SYSTEM */
        .content-container { position: relative; width: 100%; z-index: 20; padding-bottom: 20vh; display: flex; flex-direction: column; gap: 20vh; }
        
        .section-box { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 0 10%; position: relative; pointer-events: none; }
        .content-overlay {
            background: rgba(0, 10, 2, 0.75);
            backdrop-filter: blur(6px);
            padding: 4rem; border-radius: 20px;
            pointer-events: auto;
            border: 1px solid rgba(0, 255, 65, 0.1);
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            max-width: 1200px; margin: 0 auto; width: 100%;
        }

        h1, h2, h3 { font-family: 'Rajdhani', sans-serif; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; }
        .title-text { font-size: 6vw; color: #00ff41; margin-bottom: 0; text-shadow: 0 0 30px rgba(0,255,65,0.6); }
        .subtitle-text { font-size: 1.8vw; color: #6aaa7e; font-family: 'Share Tech Mono', monospace; }
        .scroll-down { position: absolute; bottom: 40px; left: 10%; font-family: 'Share Tech Mono'; color: #00ff41; animation: bounce 2s infinite; }
        
        @keyframes bounce { 0%, 20%, 50%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-20px); } 60% { transform: translateY(-10px); } }

        .accent-red { color: #ff2020; text-shadow: 0 0 20px rgba(255,32,32,0.5); }
        .accent-green { color: #00ff41; text-shadow: 0 0 20px rgba(0,255,65,0.4); }
        
        /* Stats Styles */
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin-top: 3rem; }
        .stat-card { text-align: center; padding: 2rem; background: rgba(0,25,5,0.4); border-radius: 10px; border-top: 2px solid #ff2020; }
        .stat-card.green-theme { border-top: 2px solid #00ff41; }
        .stat-number { font-family: 'Share Tech Mono'; font-size: 4rem; display: block; margin-bottom: 0.5rem; }
        
        /* How It Works Flow */
        .flow-container { display: flex; justify-content: space-between; align-items: stretch; margin-top: 3rem; flex-wrap: wrap; gap: 1rem; }
        .step-card { flex: 1; min-width: 200px; text-align: center; padding: 1.5rem; background: rgba(0,25,5,0.4); border-radius: 10px; position:relative; }
        .step-icon { width: 50px; height: 50px; color: #00ff41; margin-bottom: 1rem; }
        .step-arrows { color: #6aaa7e; opacity: 0.5; font-size: 2rem; align-self: center; }

        /* Sound Wave Animation */
        .sound-wave { display: flex; align-items: center; justify-content: center; gap: 4px; height: 100px; opacity: 0.1; position: absolute; width: 100%; top: 50%; left: 0; transform: translateY(-50%); z-index: -1; pointer-events:none; }
        .wave-bar { width: 8px; background: #00ff41; border-radius: 4px; animation: eq 1s ease-in-out infinite alternate; }
        @keyframes eq { 0% { height: 10px; } 100% { height: 80px; } }

        /* Flash click effect */
        .flash-overlay { position: fixed; top:0; left:0; width:100vw; height:100vh; background:white; z-index: 9999; opacity: 0; pointer-events: none; transition: opacity 0.5s; }

        /* ENTER BUTTONS */
        .enter-btn {
          pointer-events: auto; padding: 20px 40px; background: rgba(0,255,65,0.1); border: 1px solid #00ff41; color: #00ff41;
          font-family: 'Share Tech Mono', monospace; font-size: 1.4rem; cursor: pointer; transition: all 0.3s ease;
          box-shadow: 0 0 15px rgba(0,255,65,0.2), inset 0 0 10px rgba(0,255,65,0.1); text-transform: uppercase; margin-top: 2rem;
        }
        .enter-btn:hover { background: rgba(0,255,65,0.2); box-shadow: 0 0 30px rgba(0,255,65,0.5), inset 0 0 20px rgba(0,255,65,0.3); transform: translateY(-2px); }
        .enter-btn:active { transform: translateY(0); box-shadow: 0 0 10px rgba(0,255,65,0.2); }


      `}</style>

      {/* FLASHER ON CLICK */}
      <div id="flash" className="flash-overlay"></div>

      {/* FIXED PERMALAYER BACKGROUND SYSTEM */}
      <div className="bg-container">
        <div className="layer-sky"></div>
        <div className="layer-moon-container">
           <div className="god-rays"></div>
           <div className="moon"></div>
        </div>
        
        <div className="mist-strip mist-1"></div>
        <div className="layer-trees-1" style={{ position: 'absolute', width: '100%', height: '100%', bottom: 0, zIndex: 1, opacity: 0.6 }}>
           <TreeSilhouette fill="#001205" height={15} offset={0} seedBase={100} density={35} />
        </div>

        <div className="mist-strip mist-2"></div>
        <div className="layer-trees-2" style={{ position: 'absolute', width: '100%', height: '100%', bottom: 0, zIndex: 3 }}>
           <TreeSilhouette fill="#001a07" height={22} offset={"-2%"} seedBase={200} density={25} />
        </div>

        <div className="mist-strip mist-3"></div>
        <div className="layer-trees-3" style={{ position: 'absolute', width: '100%', height: '100%', bottom: 0, zIndex: 5 }}>
           <TreeSilhouette fill="#001f08" height={32} offset={"-5%"} seedBase={300} density={20} />
        </div>

        <div className="layer-trees-4" style={{ position: 'absolute', width: '100%', height: '100%', bottom: 0, zIndex: 7 }}>
           <TreeSilhouette fill="#000e03" height={45} offset={"-10%"} seedBase={400} density={12} />
        </div>

        <canvas ref={canvasRef} className="layer-canvas"></canvas>

        <div className="layer-trees-5" style={{ position: 'absolute', width: '100%', height: '100%', bottom: 0, zIndex: 9 }}>
           {/* Closest Foreground - Almost pure black frames */}
           <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', bottom: '-15%', height: '80%', width: '40%', left: '-20%', fill: '#000401' }}>
               <path d={generatePinePath(500, false)} />
           </svg>
           <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', bottom: '-15%', height: '75%', width: '35%', right: '-15%', fill: '#000401', transform: 'scaleX(-1)' }}>
               <path d={generatePinePath(600, false)} />
           </svg>
        </div>
        <div className="vignette"></div>
      </div>

      {/* CONTENT SYSTEM */}
      <div className="content-container">
        
        {/* S1: TITLE */}
        <div className="section-box" style={{ background: 'transparent' }}>
          <h1 className="title-text">🌲 ARANYADHWANI</h1>
          <div className="subtitle-text">Voice of the Forest</div>
          <div className="scroll-down">↓ Scroll to explore</div>
        </div>

        {/* S2: THE SCALE OF THE PROBLEM */}
        <div className="section-box" id="section-problem">
          <div className="content-overlay fade-in-section">
             <h2 className="accent-red" style={{fontSize: '3vw'}}>THE SCALE OF THE PROBLEM</h2>
             <p style={{ fontSize: '1.2rem', color: '#a8ffa8', maxWidth: '800px', margin: '1rem 0 0 0' }}>
               Rangers monitor thousands of acres alone. Traditional methods of foot patrols are highly inefficient and dangerous against organized poaching syndicates equipped with modern firearms.
             </p>
             <div className="stat-grid">
               <div className="stat-card">
                  <span className="stat-number accent-red count-up" data-target="15">0</span>
                  <p>MINUTES</p>
                  <small style={{color:'#6aaa7e'}}>Per poaching incident in India</small>
               </div>
               <div className="stat-card">
                  <span className="stat-number accent-red count-up" data-target="3">0</span>
                  <p>ANIMALS</p>
                  <small style={{color:'#6aaa7e'}}>Killed every minute worldwide</small>
               </div>
               <div className="stat-card">
                  <span className="stat-number accent-red count-up" data-target="1000">0</span>
                  <p>ACRES</p>
                  <small style={{color:'#6aaa7e'}}>Average patrol area per ranger</small>
               </div>
             </div>
          </div>
        </div>

        {/* S3: HOW IT WORKS */}
        <div className="section-box" id="how-it-works">
          <div className="content-overlay fade-in-section">
             <h2 className="accent-green" style={{fontSize: '3vw'}}>HOW IT WORKS</h2>
             <div className="flow-container">
                <div className="step-card">
                   <Mic className="step-icon" />
                   <h3 style={{margin: '0.5rem 0'}}>1. HEAR</h3>
                   <p style={{fontSize:'0.9rem', color:'#a8ffa8', margin: 0}}>Acoustic sensors continuously monitor the environment.</p>
                </div>
                <div className="step-arrows">→</div>
                <div className="step-card">
                   <Cpu className="step-icon" />
                   <h3 style={{margin: '0.5rem 0'}}>2. ANALYZE</h3>
                   <p style={{fontSize:'0.9rem', color:'#a8ffa8', margin: 0}}>Edge AI runs inference filtering wind, thunder, and snaps.</p>
                </div>
                <div className="step-arrows">→</div>
                <div className="step-card">
                   <Radio className="step-icon" />
                   <h3 style={{margin: '0.5rem 0'}}>3. TRANSMIT</h3>
                   <p style={{fontSize:'0.9rem', color:'#a8ffa8', margin: 0}}>Encrypted LoRa radio pulses exact GPS coordinates.</p>
                </div>
                <div className="step-arrows">→</div>
                <div className="step-card">
                   <Smartphone className="step-icon" />
                   <h3 style={{margin: '0.5rem 0'}}>4. ALERT</h3>
                   <p style={{fontSize:'0.9rem', color:'#a8ffa8', margin: 0}}>Operations Center receives instant notification map.</p>
                </div>
             </div>
          </div>
        </div>

        {/* S4: THE NUMBERS */}
        <div className="section-box">
          <div className="content-overlay fade-in-section">
             <h2 className="accent-green" style={{fontSize: '3vw'}}>THE NUMBERS</h2>
             <div className="stat-grid">
               <div className="stat-card green-theme">
                  <span className="stat-number accent-green count-up" data-target="3000" data-format="currency">0</span>
                  <p>PER NODE</p>
                  <small style={{color:'#6aaa7e'}}>Highly accessible deployment cost</small>
               </div>
               <div className="stat-card green-theme">
                  <span className="stat-number accent-green"><span className="count-up" data-target="150" style={{display:'inline'}}>0</span>m</span>
                  <p>RADIUS</p>
                  <small style={{color:'#6aaa7e'}}>Confirmed acoustic detection range</small>
               </div>
               <div className="stat-card green-theme">
                  <span className="stat-number accent-green">&lt;<span className="count-up" data-target="10" style={{display:'inline'}}>0</span>s</span>
                  <p>LATENCY</p>
                  <small style={{color:'#6aaa7e'}}>From gunshot fired to phone alert</small>
               </div>
               <div className="stat-card green-theme">
                  <span className="stat-number accent-green count-up" data-target="0.94" data-format="float">0</span>
                  <p>mAP CONFIDENCE</p>
                  <small style={{color:'#6aaa7e'}}>Accuracy ruling out false positives</small>
               </div>
             </div>
          </div>
        </div>

        {/* S5: FROM FOREST TO PHONE */}
        <div className="section-box" style={{textAlign: 'center'}}>
          <div className="content-overlay fade-in-section" style={{position: 'relative', overflow: 'hidden', padding: '6rem 4rem'}}>
             
             {/* Subliminal Sound Wave Background */}
             <div className="sound-wave">
                {[...Array(40)].map((_, i) => (
                    <div className="wave-bar" key={i} style={{ animationDelay: `${Math.random()}s`, height: `${20 + Math.random()*60}px` }}></div>
                ))}
             </div>

             <h2 className="accent-red" style={{fontSize: '4vw', position: 'relative', zIndex: 2}}>FROM FOREST TO PHONE</h2>
             <p style={{ fontSize: '1.4rem', color: '#fff', position: 'relative', zIndex: 2, margin: '2rem 0' }}>
               Rangers alerted in under 10 seconds. Complete tactical awareness.
             </p>
             <button className="enter-btn" style={{position: 'relative', zIndex: 2}} onClick={() => {
                 document.getElementById('flash').style.opacity = '1';
                 setTimeout(() => navigate('/dashboard'), 300);
             }}>
                Enter Operations Center →
             </button>
          </div>
        </div>

      </div>

    </div>
  );
};

export default LandingPage;
