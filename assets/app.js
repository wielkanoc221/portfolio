(function(){
  const root=document.getElementById('ap-portfolio-chronologia');
  root.querySelectorAll('a[href^="#"]').forEach(function(link){
    link.addEventListener('click',function(event){
      const target=root.querySelector(link.getAttribute('href'));
      if(!target)return;
      event.preventDefault();
      const project=target.querySelector('details.ap-project');
      if(project)project.open=true;
      target.scrollIntoView({behavior:'auto',block:'start'});
    });
  });
  const dialog=root.querySelector('#ap-image-dialog');
  const image=root.querySelector('#ap-dialog-image');
  const box=root.querySelector('.ap-dialog-image-box');
  const caption=root.querySelector('#ap-image-caption');
  let rotation=0;
  function fitImage(){
    if(!image.naturalWidth||!dialog.open)return;
    const width=image.naturalWidth;
    const height=image.naturalHeight;
    const orientedWidth=rotation?height:width;
    const orientedHeight=rotation?width:height;
    const scale=Math.min((window.innerWidth-76)/orientedWidth,(window.innerHeight-185)/orientedHeight,1);
    box.style.width=orientedWidth*scale+'px';
    box.style.height=orientedHeight*scale+'px';
    image.style.width=width*scale+'px';
    image.style.height=height*scale+'px';
    image.style.transform='translate(-50%,-50%) rotate('+rotation+'deg)';
  }
  image.addEventListener('load',fitImage);
  window.addEventListener('resize',fitImage);
  root.querySelectorAll('[data-full-image]').forEach(function(button){
    button.addEventListener('click',function(){
      rotation=Number(button.dataset.rotation)||0;
      caption.textContent=button.closest('figure').querySelector('figcaption').textContent;
      image.alt=button.querySelector('img').alt;
      image.src=button.dataset.fullImage;
      dialog.showModal();
      document.documentElement.classList.add('ap-modal-open');
      fitImage();
    });
  });
  dialog.addEventListener('close',function(){document.documentElement.classList.remove('ap-modal-open');});
  dialog.addEventListener('click',function(event){
    if(event.target!==dialog)return;
    const bounds=dialog.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();
  });
})();
