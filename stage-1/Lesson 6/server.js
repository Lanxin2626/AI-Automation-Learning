async function getPost() {
  
  try {
    const response = await fetch(
      'https://jsonplaceholder.typicode.com/posts/1'
    );

    const data = await response.json();

    console.log(data.title);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to echo message.'
    });
  }
};

getPost();