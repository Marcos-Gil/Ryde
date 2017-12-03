import React, { Component } from 'react';
import {
  AppRegistry,
  StyleSheet,
  Text,
  View,
  StatusBar,
  ScrollView,
  RefreshControl
} from 'react-native';
import { Actions } from 'react-native-router-flux';
import { Container, Header, Left, Right, Icon, Body, Button, Title, Footer, FooterTab, Content, List, CardItem, Fab } from 'native-base';
//this is not the main passenger view page. the default page will be available and you can come to this page by selecting on the pending footer tab. all the rides you have requested to join in as a passenger
//when you click on a ride, you get redirected to the PassengerPendingRideProfile. Here I send both the ride object and passenger object

import config from "./../../config";

class Pending extends Component {

  constructor(props){
    super(props);
    this.baseUrl = config();
    this.state = {
      data: [],
      refreshing: false
    }
  }

  findButton(){
    let {isPassenger, resObj, driverFilledObj} = this.props;
    Actions.rideSearch({isPassenger, resObj, driverFilledObj});
  }

  retrievePendingPosts(){

    return fetch(this.baseUrl + this.props.resObj.email + '/pending', {
      method: "GET"
    })
    .then((response) => {
      if(response.status === 200) {
        resObjPromise = response.json();

        resObjPromise.then((resObj) => {
          dataSet = [];
          let {isPassenger, driverFilledObj} = this.props;
          for(let i=0;i<resObj.length;i++){
            let resO = resObj[i]; //ride obj
            let myRes = this.props.resObj; //passenger obj

            dataSet.push(
              <View key={i}>
                <CardItem button
                  onPress={()=>
                    Actions.pendingProfile({isPassenger, resO, myRes, driverFilledObj})}>
                    <Body>
                      <Text>From: {resObj[i].from}</Text>
                      <Text>To: {resObj[i].to}</Text>
                      <Text>Date: {resObj[i].date}</Text>
                      <Text style={{left: 320}}>Price: ${resObj[i].price}</Text>
                    </Body>
                  </CardItem>
                  <Text></Text>
                </View>
              )
            }
            if(this._Mounted) {
              this.setState({data: dataSet})
            }
          })
        }
      }, (err) => {
        alert(err)
      });
    }

    componentDidMount(){
      this._Mounted = true;
      this.retrievePendingPosts();
    }

    componentWillUnmount(){
      this._Mounted = false;
    }

    onRefresh(){
      if(this._Mounted) {
        this.setState({refreshing: true});
      }
      this.retrievePendingPosts().then(() => {
        if(this._Mounted) {
          this.setState({refreshing:false});
        }
      });
    }


    render() {
      let resObj = this.props.resObj;
      //this.retrievePendingPosts();

      return (
        <Container>
          <ScrollView
            refreshControl={<RefreshControl
              refreshing={this.state.refreshing}
              onRefresh={this.onRefresh.bind(this)}
              />
          }>
          <Content>
            {this.state.data}
          </Content>
        </ScrollView>
        <View>
          <Fab
            active={this.state.active}
            direction="up"
            containerStyle={{ }}
            style={{ backgroundColor: 'rgb(72, 110, 255)' }}
            position="bottomRight"
            onPress={() => {this.findButton()}}>
            <Icon name="search" />
          </Fab>
        </View>
      </Container>


    );
  }
}

module.exports = Pending;

AppRegistry.registerComponent('Pending', () => Pending);
