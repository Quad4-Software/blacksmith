export async function createDropzone(el, opts) {
  const [{Dropzone}] = await Promise.all([
    import('dropzone'),
    import('dropzone/dist/dropzone.css'),
  ]);
  return new Dropzone(el, opts);
}
