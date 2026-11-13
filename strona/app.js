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
