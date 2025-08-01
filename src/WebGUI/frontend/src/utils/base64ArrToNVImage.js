import { NVImage } from "@niivue/niivue";

export const base64ArrToNVImage = (base64Arr, isNifti = false) => {
  const dataBuffer = [];

  for (let i = 0; i < base64Arr.length; i++) {
    const binarizedData = atob(base64Arr[i]);
    // console.debug(`Binary data length ${binarizedData.length}`)
    const bytes = new Uint8Array(binarizedData.length);

    for (let j = 0; j < binarizedData.length; j++) {
      bytes[j] = binarizedData.charCodeAt(j);
    }
    // console.log(`Got bytes array ${JSON.stringify(bytes)}`)
    const arrayBuffer = bytes.buffer;
    // console.log(`Got ArrayBuffer of ${arrayBuffer.byteLength} bytes`);
    dataBuffer.push(arrayBuffer);
  }
  // console.log("Generating databuffer", dataBuffer);
  if (isNifti) {
    // async method
    return NVImage.loadFromUrl({ url: dataBuffer[0] });
  }
  return new NVImage(dataBuffer);
};

export const base64ToUInt8Array = (base64) => {
  const binarizedData = atob(base64);
  const bytes = new Uint8Array(binarizedData.length);

  for (let j = 0; j < binarizedData.length; j++) {
    bytes[j] = binarizedData.charCodeAt(j);
  }
  return bytes;
};
