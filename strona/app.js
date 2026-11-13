(function(){
  /* Prosty router: #id projektu pokazuje jego opis, każdy inny adres — stronę główną. */
  var projects=document.querySelectorAll('.project');
  var lastHomeAnchor='projekty';
  function route(){
    var id=decodeURIComponent(location.hash.slice(1));
    var target=id&&document.getElementById(id);
    var isProject=target&&target.classList.contains('project');
    projects.forEach(function(p){p.classList.toggle('is-active',p===target);});
    document.body.classList.toggle('view-project',!!isProject);
    if(isProject){window.scrollTo({top:0,behavior:'instant'});target.querySelector('h2').focus({preventScroll:true});}
    else if(target){target.scrollIntoView({behavior:'instant'});}
  }
  projects.forEach(function(p){p.querySelector('h2').setAttribute('tabindex','-1');});
  window.addEventListener('hashchange',route);
  route();

  /* Powiększanie zdjęć */
  var dialog=document.getElementById('image-dialog');
  var image=document.getElementById('dialog-image');
  var box=dialog.querySelector('.dialog-box');
  var caption=document.getElementById('dialog-caption');
  var rotation=0;
  function fit(){
    if(!image.naturalWidth||!dialog.open)return;
    var w=image.naturalWidth,h=image.naturalHeight;
    var ow=rotation?h:w,oh=rotation?w:h;
    var s=Math.min((window.innerWidth-70)/ow,(window.innerHeight-180)/oh,1);
    box.style.width=ow*s+'px';box.style.height=oh*s+'px';
    image.style.width=w*s+'px';image.style.height=h*s+'px';
    image.style.transform='translate(-50%,-50%) rotate('+rotation+'deg)';
  }
  image.addEventListener('load',fit);
  window.addEventListener('resize',fit);
  document.querySelectorAll('[data-full-image]').forEach(function(btn){
    btn.addEventListener('click',function(){
      rotation=Number(btn.dataset.rotation)||0;
      caption.textContent=btn.closest('figure').querySelector('figcaption').textContent;
      image.alt=btn.querySelector('img').alt;
      image.src=btn.dataset.fullImage;
      dialog.showModal();
      document.documentElement.classList.add('modal-open');
      fit();
    });
  });
  dialog.addEventListener('close',function(){document.documentElement.classList.remove('modal-open');});
  dialog.addEventListener('click',function(e){if(e.target===dialog)dialog.close();});
})();

(function(){
  /* Statystyki: zdarzenia trafiają do Umami (jeśli skrypt jest wczytany). */
  var queue=[];
  function track(name,data){
    if(window.umami&&typeof window.umami.track==='function'){window.umami.track(name,data);}
    else if(queue.length<50){queue.push([name,data]);}
  }
  var flush=setInterval(function(){
    if(window.umami&&typeof window.umami.track==='function'){
      queue.splice(0).forEach(function(e){window.umami.track(e[0],e[1]);});
      clearInterval(flush);
    }
  },500);
  setTimeout(function(){clearInterval(flush);},15000);

  /* Rozmazany kontakt — prawdziwe dane składane dopiero po kliknięciu. */
  var parts={
    email:{text:function(){return ['apietka38','gmail.com'].join('@');},href:function(t){return 'mailto:'+t;}},
    phone:{text:function(){return ['692','506','517'].join(' ');},href:function(t){return 'tel:+48'+t.replace(/ /g,'');}}
  };
  document.querySelectorAll('[data-reveal]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var kind=btn.dataset.reveal,p=parts[kind];if(!p)return;
      var text=p.text();
      document.querySelectorAll('[data-reveal="'+kind+'"]').forEach(function(b){
        var a=document.createElement('a');
        a.className='revealed';a.href=p.href(text);
        a.innerHTML=b.querySelector('[aria-hidden]').outerHTML+' ';
        a.appendChild(document.createTextNode(text));
        a.addEventListener('click',function(){track(kind==='email'?'klik-email':'klik-telefon');});
        b.replaceWith(a);
      });
      track(kind==='email'?'pokaz-email':'pokaz-telefon',{miejsce:btn.closest('footer')?'stopka':'gora'});
    });
  });

  /* Otwarcia projektów i czas czytania */
  var current=null,start=0,visibleMs=0;
  function activeProject(){var a=document.querySelector('.project.is-active');return a?a.id:null;}
  function pause(){if(current&&start){visibleMs+=Date.now()-start;start=0;}}
  function resume(){if(current&&!start&&document.visibilityState==='visible'){start=Date.now();}}
  function finish(){
    pause();
    if(current){
      var sek=Math.round(visibleMs/1000);
      if(sek>=2)track('czas-czytania',{projekt:current,sekundy:sek});
    }
    current=null;visibleMs=0;
  }
  function onRoute(){
    var id=activeProject();
    if(id===current)return;
    finish();
    if(id){current=id;track('otwarcie-projektu',{projekt:id});resume();}
  }
  window.addEventListener('hashchange',onRoute);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden'){var id=current;finish();current=id;}else{resume();}
  });
  onRoute();

  /* Kliknięcia w linki: accur8pool.pl, notatnik z analizą */
  document.addEventListener('click',function(e){
    var a=e.target.closest('a');if(!a)return;
    var href=a.getAttribute('href')||'';
    if(href.indexOf('accur8pool.pl')!==-1)track('klik-accur8pool-pl',{miejsce:a.classList.contains('site-link')?'przycisk':'tekst'});
    else if(href.indexOf('analiza-danych')!==-1)track('klik-analiza-danych');
    else if(href.indexOf('CV-Andrzej-Pietka.pdf')!==-1)track('pobranie-cv',{miejsce:a.closest('footer')?'stopka':'gora'});
  });
})();
