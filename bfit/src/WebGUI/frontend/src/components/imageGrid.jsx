import React from 'react';
import { Grid, Card, CardMedia, Typography } from '@mui/material';

export default function ThreeImageGrid({ images }) {
  // `images` should be an array of 3 base64 strings (including the mime type)

  return (
    <Grid container spacing={2}>
      {images.map((imgSrc, index) => (
        <Grid item xs={12} sm={12} key={index}>
          <Card>
            <CardMedia
              component="img"
              height="auto"
              image={imgSrc.artifact}
            />
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}